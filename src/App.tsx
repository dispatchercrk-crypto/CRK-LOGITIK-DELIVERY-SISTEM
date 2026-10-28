import { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AppStateResponse,
  Assignment,
  DriverMaster,
  OriginMaster,
  RouteMaster,
  ToastMessage,
  UserRole,
  VehicleMaster,
  WhatsAppNotificationLog,
  WhatsAppTargetMode,
} from './types';
import {
  buildWhatsAppDirectUrl,
  buildWhatsAppGroupUrl,
  launchWhatsAppUrl,
} from './utils/whatsapp';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
} from './services/googleAuth';
import {
  deleteAssignmentFromFirestore,
  deleteDriverFromFirestore,
  deleteOriginFromFirestore,
  deleteRouteFromFirestore,
  deleteVehicleFromFirestore,
  pullWorkspaceFromFirestore,
  reconcileFullStateToFirestore,
  subscribeToFirestoreWorkspace,
  upsertAssignmentInFirestore,
  upsertConfigInFirestore,
  upsertDriverInFirestore,
  upsertOriginInFirestore,
  upsertRouteInFirestore,
  upsertVehicleInFirestore,
} from './services/firestoreSync';
import {
  createNewDatabaseSpreadsheet,
  extractSpreadsheetId,
  pullAllFromSpreadsheet,
  pushAssignmentsToSpreadsheet,
  pushConfigToSpreadsheet,
  pushDriversToSpreadsheet,
  pushOriginsToSpreadsheet,
  pushRoutesToSpreadsheet,
  pushVehiclesToSpreadsheet,
} from './services/sheetsSync';
import { LoginPage } from './components/LoginPage';
import { AdminPortal } from './components/AdminPortal';
import { DriverPortal } from './components/DriverPortal';
import { ToastContainer } from './components/ToastContainer';

const INITIAL_STATE: AppStateResponse = {
  drivers: [],
  vehicles: [],
  origins: [],
  routes: [],
  assignments: [],
  notifications: [],
  config: {
    spreadsheetId: '',
    spreadsheetTitle: '',
    spreadsheetUrl: '',
    lastSyncedAt: null,
    dispatcherWaPhone: '',
    whatsappTargetMode: 'GROUP',
    whatsappGroupName: 'Grup Operasional CRK Logistik',
    whatsappGroupInviteUrl: '',
    letterPrefix: 'ST-CRK',
    lastSequence: 0,
    isDefaultPin: true,
    whatsappGatewayConfigured: false,
  },
};

export default function App() {
  const [appState, setAppState] = useState<AppStateResponse>(INITIAL_STATE);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [sessionRole, setSessionRole] = useState<UserRole | null>(null);
  const [loggedInDriver, setLoggedInDriver] = useState<DriverMaster | null>(
    null
  );

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const syncInFlightRef = useRef<boolean>(false);
  const cloudMutationLockRef = useRef<boolean>(false);

  const addToast = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `toast-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSheetsAuthError = useCallback(
    (err: unknown) => {
      const status = (err as { status?: number })?.status;
      const msg =
        err instanceof Error ? err.message : 'Kesalahan Google Sheets API';
      if (status === 401 || status === 403) {
        clearAccessToken();
        setHasGoogleToken(false);
        addToast(
          'error',
          'Sesi Google Sheets Perlu Diperbarui',
          'Silakan klik Sign in with Google kembali untuk menyinkronkan Spreadsheet.'
        );
      } else {
        addToast('error', 'Sinkronisasi Spreadsheet Gagal', msg);
      }
    },
    [addToast]
  );

  const runCloudTask = useCallback(
    async (task: () => Promise<void>) => {
      try {
        cloudMutationLockRef.current = true;
        await task();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Quota exceeded')) {
          addToast(
            'error',
            'Kuota Cloud Harian Tercapai',
            'Kuota penyimpanan cloud gratis hari ini penuh dan akan disetel ulang besok.'
          );
        }
        throw err;
      } finally {
        cloudMutationLockRef.current = false;
      }
    },
    [addToast]
  );

  const fetchServerState =
    useCallback(async (): Promise<AppStateResponse | null> => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return null;
        const data = (await res.json()) as AppStateResponse;
        setAppState(data);
        return data;
      } catch {
        return null;
      } finally {
        setLoadingInitial(false);
      }
    }, []);

  const syncWithGoogleSheets = useCallback(
    async (explicitSpreadsheetId?: string, silent = false): Promise<boolean> => {
      const token = getAccessToken();
      const targetSheetId = extractSpreadsheetId(
        explicitSpreadsheetId ?? appState.config.spreadsheetId
      );

      if (!token || !targetSheetId) {
        const latest = await fetchServerState();
        if (latest && googleUser?.emailVerified) {
          void runCloudTask(() =>
            reconcileFullStateToFirestore(googleUser, latest, false)
          );
        }
        if (!silent) {
          if (!token && targetSheetId) {
            addToast(
              'info',
              'Data Lokal Dimuat Ulang',
              'Hubungkan akun Google untuk sinkronisasi langsung dengan Google Sheets.'
            );
          } else if (latest) {
            addToast('info', 'Data Diperbarui', 'Status terbaru berhasil dimuat.');
          }
        }
        return Boolean(latest);
      }

      if (syncInFlightRef.current) return false;
      syncInFlightRef.current = true;
      setIsSyncing(true);

      try {
        const pulled = await pullAllFromSpreadsheet(token, targetSheetId);
        const mirrorRes = await fetch('/api/sync/from-sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pulled),
        });
        const mirrorData = await mirrorRes.json();
        if (mirrorRes.ok && mirrorData.state) {
          let nextState = mirrorData.state as AppStateResponse;
          setAppState(nextState);

          if (mirrorData.hasPendingDriverUpdates) {
            await pushAssignmentsToSpreadsheet(
              token,
              targetSheetId,
              nextState.assignments
            );
            await pushVehiclesToSpreadsheet(
              token,
              targetSheetId,
              nextState.vehicles
            );
            const markRes = await fetch('/api/sync/mark-pushed', {
              method: 'POST',
            });
            if (markRes.ok) {
              const markJson = await markRes.json();
              if (markJson.state) {
                nextState = markJson.state as AppStateResponse;
                setAppState(nextState);
              }
            }
          }

          if (googleUser?.emailVerified) {
            void runCloudTask(() =>
              reconcileFullStateToFirestore(googleUser, nextState, true)
            );
          }

          if (!silent) {
            addToast(
              'success',
              'Sinkronisasi Spreadsheets Berhasil',
              `Terhubung dengan "${pulled.spreadsheetTitle}".`
            );
          }
          return true;
        }
        return false;
      } catch (err) {
        if (!silent) {
          handleSheetsAuthError(err);
        }
        return false;
      } finally {
        syncInFlightRef.current = false;
        setIsSyncing(false);
      }
    },
    [
      appState.config.spreadsheetId,
      googleUser,
      addToast,
      fetchServerState,
      handleSheetsAuthError,
      runCloudTask,
    ]
  );

  useEffect(() => {
    fetchServerState();
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
        setHasGoogleToken(true);
        setAuthReady(true);
      },
      (user) => {
        setGoogleUser(user);
        setHasGoogleToken(false);
        setAuthReady(true);
      }
    );
    return () => unsubscribe();
  }, [fetchServerState]);

  // Real-time Firestore Cloud Persistence (gated strictly on authReady & verified user)
  useEffect(() => {
    if (!authReady || !googleUser || !googleUser.emailVerified) {
      return;
    }

    let cancelled = false;
    let unsubscribeListeners: (() => void) | null = null;

    const bootstrapAndListen = async () => {
      try {
        const [serverRes, cloudWorkspace] = await Promise.all([
          fetch('/api/state').then((r) =>
            r.ok ? (r.json() as Promise<AppStateResponse>) : null
          ),
          pullWorkspaceFromFirestore(googleUser),
        ]);

        if (cancelled || !cloudWorkspace) return;

        if (cloudWorkspace.hasAnyCloudData) {
          const hydrateRes = await fetch('/api/sync/from-firestore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: cloudWorkspace.config,
              drivers: cloudWorkspace.drivers,
              vehicles: cloudWorkspace.vehicles,
              origins: cloudWorkspace.origins,
              routes: cloudWorkspace.routes,
              assignments: cloudWorkspace.assignments,
              replaceCollections: false,
            }),
          });
          if (hydrateRes.ok) {
            const hydrateJson = await hydrateRes.json();
            if (!cancelled && hydrateJson.state) {
              setAppState(hydrateJson.state as AppStateResponse);
              if (hydrateJson.hasLocalUpdatesForCloud) {
                await runCloudTask(() =>
                  reconcileFullStateToFirestore(
                    googleUser,
                    hydrateJson.state as AppStateResponse,
                    false
                  )
                );
              }
            }
          }
        } else if (serverRes) {
          await runCloudTask(() =>
            reconcileFullStateToFirestore(googleUser, serverRes, false)
          );
        }

        if (cancelled) return;

        unsubscribeListeners = subscribeToFirestoreWorkspace(
          googleUser,
          (partial) => {
            if (cancelled || cloudMutationLockRef.current) return;
            void (async () => {
              try {
                const syncRes = await fetch('/api/sync/from-firestore', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...partial,
                    replaceCollections: true,
                  }),
                });
                if (!syncRes.ok) return;
                const syncJson = await syncRes.json();
                if (!cancelled && syncJson.state) {
                  setAppState(syncJson.state as AppStateResponse);
                  if (syncJson.hasLocalUpdatesForCloud) {
                    await runCloudTask(() =>
                      reconcileFullStateToFirestore(
                        googleUser,
                        syncJson.state as AppStateResponse,
                        false
                      )
                    );
                  }
                }
              } catch {
                // Ignore transient network errors when hydrating local express mirror
              }
            })();
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Quota exceeded')) {
          addToast(
            'error',
            'Kuota Cloud Harian Tercapai',
            'Kuota penyimpanan cloud gratis hari ini penuh dan akan disetel ulang besok.'
          );
        }
        throw err;
      }
    };

    void bootstrapAndListen();

    return () => {
      cancelled = true;
      if (unsubscribeListeners) {
        unsubscribeListeners();
      }
    };
  }, [authReady, googleUser, addToast, runCloudTask]);

  useEffect(() => {
    if (hasGoogleToken && appState.config.spreadsheetId) {
      syncWithGoogleSheets(appState.config.spreadsheetId, true);
    }

    const checkAndSyncServerProgress = async () => {
      const latest = await fetchServerState();
      if (
        latest &&
        googleUser?.emailVerified &&
        latest.assignments.some((a) => a.needsSheetSync)
      ) {
        void runCloudTask(async () => {
          for (const asg of latest.assignments) {
            if (asg.needsSheetSync) {
              await upsertAssignmentInFirestore(googleUser, asg);
            }
          }
          for (const veh of latest.vehicles) {
            await upsertVehicleInFirestore(googleUser, veh);
          }
        });
      }
    };

    const interval = setInterval(() => {
      if (hasGoogleToken && appState.config.spreadsheetId) {
        syncWithGoogleSheets(appState.config.spreadsheetId, true);
      } else {
        void checkAndSyncServerProgress();
      }
    }, 20000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (hasGoogleToken && appState.config.spreadsheetId) {
          syncWithGoogleSheets(appState.config.spreadsheetId, true);
        } else {
          void checkAndSyncServerProgress();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    hasGoogleToken,
    googleUser,
    appState.config.spreadsheetId,
    syncWithGoogleSheets,
    fetchServerState,
    runCloudTask,
  ]);

  useEffect(() => {
    if (loggedInDriver) {
      const updated = appState.drivers.find(
        (d) => d.id.toLowerCase() === loggedInDriver.id.toLowerCase()
      );
      if (updated) {
        setLoggedInDriver(updated);
      }
    }
  }, [appState.drivers, loggedInDriver]);

  const handleGoogleLogin = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setHasGoogleToken(true);
        addToast(
          'success',
          'Akun Google Terhubung',
          `Masuk sebagai ${result.user.email}.`
        );
        if (appState.config.spreadsheetId) {
          await syncWithGoogleSheets(appState.config.spreadsheetId, false);
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Login Google dibatalkan.';
      addToast('error', 'Gagal Menghubungkan Google', msg);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setHasGoogleToken(false);
    addToast(
      'info',
      'Sesi Google Diputus',
      'Token akses Google Sheets telah dihapus.'
    );
  };

  const handleConnectSpreadsheet = async (input: string): Promise<boolean> => {
    const extractedId = extractSpreadsheetId(input);
    if (!extractedId) {
      addToast(
        'error',
        'ID Spreadsheet Tidak Valid',
        'Periksa kembali URL Google Sheets.'
      );
      return false;
    }

    const cfgRes = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: extractedId,
        resetLocalCache: true,
      }),
    });
    if (cfgRes.ok) {
      const cfgJson = await cfgRes.json();
      if (cfgJson.state && googleUser?.emailVerified) {
        void runCloudTask(() =>
          upsertConfigInFirestore(googleUser, cfgJson.state.config)
        );
      }
    }

    return await syncWithGoogleSheets(extractedId, false);
  };

  const handleCreateSpreadsheet = async (
    customTitle: string
  ): Promise<boolean> => {
    const token = getAccessToken();
    if (!token) {
      addToast(
        'error',
        'Autentikasi Diperlukan',
        'Klik Sign in with Google terlebih dahulu.'
      );
      return false;
    }

    setIsSyncing(true);
    try {
      const created = await createNewDatabaseSpreadsheet(token, customTitle);
      const cfgRes = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: created.spreadsheetId,
          spreadsheetTitle: created.title,
          spreadsheetUrl: created.url,
          lastSyncedAt: new Date().toISOString(),
          resetLocalCache: true,
        }),
      });
      const cfgData = await cfgRes.json();
      if (cfgRes.ok && cfgData.state) {
        setAppState(cfgData.state);
        if (googleUser?.emailVerified) {
          void runCloudTask(() =>
            reconcileFullStateToFirestore(googleUser, cfgData.state, true)
          );
        }
        await pushConfigToSpreadsheet(token, created.spreadsheetId, {
          adminPin: cfgData.adminPin || '123456',
          dispatcherWaPhone: cfgData.state.config.dispatcherWaPhone || '',
          whatsappTargetMode:
            cfgData.state.config.whatsappTargetMode || 'GROUP',
          whatsappGroupName:
            cfgData.state.config.whatsappGroupName ||
            'Grup Operasional CRK Logistik',
          whatsappGroupInviteUrl:
            cfgData.state.config.whatsappGroupInviteUrl || '',
          letterPrefix: cfgData.state.config.letterPrefix || 'ST-CRK',
        });
      }
      addToast(
        'success',
        'Spreadsheet Database Baru Dibuat',
        `File "${created.title}" siap digunakan dan tersinkronisasi.`
      );
      return true;
    } catch (err) {
      handleSheetsAuthError(err);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const pushToSheetsIfActive = async (
    kind: 'drivers' | 'vehicles' | 'origins' | 'routes' | 'assignments',
    nextState: AppStateResponse
  ) => {
    const token = getAccessToken();
    const sheetId = nextState.config.spreadsheetId;
    if (!token || !sheetId) return;

    try {
      setIsSyncing(true);
      if (kind === 'drivers') {
        await pushDriversToSpreadsheet(token, sheetId, nextState.drivers);
      } else if (kind === 'vehicles') {
        await pushVehiclesToSpreadsheet(token, sheetId, nextState.vehicles);
      } else if (kind === 'origins') {
        await pushOriginsToSpreadsheet(token, sheetId, nextState.origins);
      } else if (kind === 'routes') {
        await pushRoutesToSpreadsheet(token, sheetId, nextState.routes);
      } else if (kind === 'assignments') {
        await pushAssignmentsToSpreadsheet(
          token,
          sheetId,
          nextState.assignments
        );
      }
    } catch (err) {
      handleSheetsAuthError(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateAssignment = async (
    payload: Partial<Assignment>,
    waTargetMode: WhatsAppTargetMode
  ): Promise<WhatsAppNotificationLog | null> => {
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menerbitkan Surat Tugas', data.error);
        return null;
      }

      const notif = data.notification as WhatsAppNotificationLog;
      if (notif) {
        const targetUrl =
          waTargetMode === 'GROUP'
            ? notif.waGroupUrl || buildWhatsAppGroupUrl(notif.message)
            : buildWhatsAppDirectUrl(
                data.assignment?.driverPhone ||
                  data.state?.config?.dispatcherWaPhone ||
                  '',
                notif.message,
                false
              );
        // Open WhatsApp immediately in 1 click before slow cloud sync
        launchWhatsAppUrl(targetUrl);
      }

      setAppState(data.state);
      addToast(
        'success',
        'Surat Tugas Diterbitkan & Membuka WhatsApp',
        `Nomor ${data.assignment.noPenugasan} berhasil dibuat secara berurutan.`
      );

      if (googleUser?.emailVerified) {
        void runCloudTask(async () => {
          await upsertAssignmentInFirestore(googleUser, data.assignment);
          await upsertConfigInFirestore(googleUser, data.state.config);
          for (const veh of (data.state as AppStateResponse).vehicles) {
            await upsertVehicleInFirestore(googleUser, veh);
          }
        });
      }

      await pushToSheetsIfActive('assignments', data.state);
      return notif;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menyimpan Surat Tugas.');
      return null;
    }
  };

  const handleUpdateAssignment = async (
    id: string,
    payload: Partial<Assignment> & {
      kmAwal?: number | '';
      suhuAwal?: string;
      kmAkhir?: number | '';
      suhuAkhir?: string;
      penerimaNama?: string;
    }
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/assignments/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Memperbarui Surat Tugas', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(async () => {
          await upsertAssignmentInFirestore(googleUser, data.assignment);
          for (const veh of (data.state as AppStateResponse).vehicles) {
            await upsertVehicleInFirestore(googleUser, veh);
          }
        });
      }

      await pushToSheetsIfActive('assignments', data.state);
      addToast(
        'success',
        'Surat Tugas Diperbarui',
        `${data.assignment.noPenugasan} telah diperbarui.`
      );
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal memperbarui Surat Tugas.');
      return false;
    }
  };

  const handleDeleteAssignment = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/assignments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menghapus Surat Tugas', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(async () => {
          await deleteAssignmentFromFirestore(googleUser, id);
          for (const veh of (data.state as AppStateResponse).vehicles) {
            await upsertVehicleInFirestore(googleUser, veh);
          }
        });
      }

      await pushToSheetsIfActive('assignments', data.state);
      addToast(
        'success',
        'Surat Tugas Dihapus',
        'Data telah dihapus dari sistem & cloud.'
      );
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menghapus Surat Tugas.');
      return false;
    }
  };

  const handleSaveDriver = async (
    mode: 'create' | 'edit',
    originalId: string,
    driver: DriverMaster
  ): Promise<boolean> => {
    try {
      const url =
        mode === 'create'
          ? '/api/master/drivers'
          : `/api/master/drivers/${encodeURIComponent(originalId)}`;
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driver),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menyimpan Driver', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() =>
          upsertDriverInFirestore(
            googleUser,
            driver,
            mode === 'edit' ? originalId : undefined
          )
        );
      }

      await pushToSheetsIfActive('drivers', data.state);
      addToast(
        'success',
        mode === 'create' ? 'Driver Ditambahkan' : 'Driver Diperbarui',
        `${driver.id} — ${driver.name} tersinkronisasi.`
      );
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menyimpan Master Driver.');
      return false;
    }
  };

  const handleDeleteDriver = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/master/drivers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menghapus Driver', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() => deleteDriverFromFirestore(googleUser, id));
      }

      await pushToSheetsIfActive('drivers', data.state);
      addToast('success', 'Driver Dihapus', `ID Driver ${id} telah dihapus.`);
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menghapus Master Driver.');
      return false;
    }
  };

  const handleSaveVehicle = async (
    mode: 'create' | 'edit',
    originalId: string,
    vehicle: VehicleMaster
  ): Promise<boolean> => {
    try {
      const url =
        mode === 'create'
          ? '/api/master/vehicles'
          : `/api/master/vehicles/${encodeURIComponent(originalId)}`;
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menyimpan Armada', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() =>
          upsertVehicleInFirestore(
            googleUser,
            vehicle,
            mode === 'edit' ? originalId : undefined
          )
        );
      }

      await pushToSheetsIfActive('vehicles', data.state);
      addToast(
        'success',
        mode === 'create' ? 'Armada Ditambahkan' : 'Armada Diperbarui',
        `${vehicle.plateNumber} tersinkronisasi.`
      );
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menyimpan Master Armada.');
      return false;
    }
  };

  const handleDeleteVehicle = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/master/vehicles/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menghapus Armada', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() => deleteVehicleFromFirestore(googleUser, id));
      }

      await pushToSheetsIfActive('vehicles', data.state);
      addToast('success', 'Armada Dihapus', `Unit ${id} telah dihapus.`);
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menghapus Master Armada.');
      return false;
    }
  };

  const handleSaveOrigin = async (
    mode: 'create' | 'edit',
    originalId: string,
    origin: OriginMaster
  ): Promise<boolean> => {
    try {
      const url =
        mode === 'create'
          ? '/api/master/origins'
          : `/api/master/origins/${encodeURIComponent(originalId)}`;
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(origin),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menyimpan Lokasi Asal', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() =>
          upsertOriginInFirestore(
            googleUser,
            origin,
            mode === 'edit' ? originalId : undefined
          )
        );
      }

      await pushToSheetsIfActive('origins', data.state);
      addToast(
        'success',
        mode === 'create'
          ? 'Lokasi Asal Ditambahkan'
          : 'Lokasi Asal Diperbarui',
        `${origin.name} tersinkronisasi.`
      );
      return true;
    } catch {
      addToast(
        'error',
        'Kesalahan Jaringan',
        'Gagal menyimpan Master Lokasi Asal.'
      );
      return false;
    }
  };

  const handleDeleteOrigin = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/master/origins/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menghapus Lokasi Asal', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() => deleteOriginFromFirestore(googleUser, id));
      }

      await pushToSheetsIfActive('origins', data.state);
      addToast('success', 'Lokasi Asal Dihapus', `Kode ${id} telah dihapus.`);
      return true;
    } catch {
      addToast(
        'error',
        'Kesalahan Jaringan',
        'Gagal menghapus Master Lokasi Asal.'
      );
      return false;
    }
  };

  const handleSaveRoute = async (
    mode: 'create' | 'edit',
    originalId: string,
    route: RouteMaster
  ): Promise<boolean> => {
    try {
      const url =
        mode === 'create'
          ? '/api/master/routes'
          : `/api/master/routes/${encodeURIComponent(originalId)}`;
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(route),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menyimpan Rute', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() =>
          upsertRouteInFirestore(
            googleUser,
            route,
            mode === 'edit' ? originalId : undefined
          )
        );
      }

      await pushToSheetsIfActive('routes', data.state);
      addToast(
        'success',
        mode === 'create' ? 'Rute Ditambahkan' : 'Rute Diperbarui',
        `${route.destination} tersinkronisasi.`
      );
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menyimpan Master Rute.');
      return false;
    }
  };

  const handleDeleteRoute = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/master/routes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menghapus Rute', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() => deleteRouteFromFirestore(googleUser, id));
      }

      await pushToSheetsIfActive('routes', data.state);
      addToast('success', 'Rute Dihapus', `Kode Rute ${id} telah dihapus.`);
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menghapus Master Rute.');
      return false;
    }
  };

  const handleSaveOperationalSettings = async (settings: {
    dispatcherWaPhone: string;
    whatsappTargetMode: WhatsAppTargetMode;
    whatsappGroupName: string;
    whatsappGroupInviteUrl: string;
    letterPrefix: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Menyimpan Pengaturan', data.error);
        return false;
      }
      setAppState(data.state);

      if (googleUser?.emailVerified) {
        void runCloudTask(() =>
          upsertConfigInFirestore(googleUser, data.state.config)
        );
      }

      const token = getAccessToken();
      const sheetId = data.state.config.spreadsheetId;
      if (token && sheetId) {
        await pushConfigToSpreadsheet(token, sheetId, {
          adminPin: data.adminPin,
          dispatcherWaPhone: settings.dispatcherWaPhone,
          whatsappTargetMode: settings.whatsappTargetMode,
          whatsappGroupName: settings.whatsappGroupName,
          whatsappGroupInviteUrl: settings.whatsappGroupInviteUrl,
          letterPrefix: settings.letterPrefix,
        });
      }

      addToast(
        'success',
        'Pengaturan Disimpan',
        'Konfigurasi Grup WhatsApp, Dispatcher & Prefix berhasil diperbarui.'
      );
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal menyimpan pengaturan.');
      return false;
    }
  };

  const handleTestWhatsAppNetwork = async (targetPhone: string) => {
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Uji WhatsApp Gagal', data.error);
        return;
      }
      setAppState(data.state);
      addToast(
        'success',
        'Pesan Uji WhatsApp Siap',
        'Klik tombol Kirim ke Grup WA atau WA Nomor pada riwayat di bawah.'
      );
    } catch {
      addToast(
        'error',
        'Kesalahan Jaringan',
        'Gagal membuat pesan uji WhatsApp.'
      );
    }
  };

  const handleChangeAdminPin = async (
    currentPin: string,
    newPin: string
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Mengubah PIN', data.error);
        return false;
      }
      setAppState(data.state);

      const token = getAccessToken();
      const sheetId = data.state.config.spreadsheetId;
      if (token && sheetId) {
        await pushConfigToSpreadsheet(token, sheetId, {
          adminPin: data.adminPin,
          dispatcherWaPhone: data.state.config.dispatcherWaPhone,
          whatsappTargetMode: data.state.config.whatsappTargetMode,
          whatsappGroupName: data.state.config.whatsappGroupName,
          whatsappGroupInviteUrl: data.state.config.whatsappGroupInviteUrl,
          letterPrefix: data.state.config.letterPrefix,
        });
      }

      addToast(
        'success',
        'PIN Admin Dispatcher Diperbarui',
        'PIN baru Anda telah aktif dan tersinkronisasi.'
      );
      return true;
    } catch {
      addToast('error', 'Kesalahan Jaringan', 'Gagal memperbarui PIN Admin.');
      return false;
    }
  };

  const handleDriverDeparture = async (
    assignmentId: string,
    payload: {
      kmAwal: number;
      suhuAwal: string;
      bbmAwal: string;
      kondisiKendaraan: string;
      catatanBerangkat: string;
      fotoOdometerBerangkat?: string;
      fotoSuhuBerangkat?: string;
    },
    waTargetMode: WhatsAppTargetMode
  ): Promise<WhatsAppNotificationLog | null> => {
    try {
      const res = await fetch(
        `/api/assignments/${encodeURIComponent(assignmentId)}/departure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Mengirim Data Keberangkatan', data.error);
        return null;
      }

      const notif = data.notification as WhatsAppNotificationLog;
      if (notif) {
        const targetUrl =
          waTargetMode === 'GROUP'
            ? notif.waGroupUrl || buildWhatsAppGroupUrl(notif.message)
            : buildWhatsAppDirectUrl(
                data.state?.config?.dispatcherWaPhone || '',
                notif.message,
                false
              );
        // Open WhatsApp immediately in 1 click before slow cloud Sheets sync
        launchWhatsAppUrl(targetUrl);
      }

      setAppState(data.state);
      addToast(
        'success',
        'Keberangkatan Tersimpan & Membuka WhatsApp',
        waTargetMode === 'GROUP'
          ? 'Pilih Grup WhatsApp tujuan untuk mengirim laporan keberangkatan.'
          : 'Membuka chat WhatsApp Dispatcher secara otomatis.'
      );

      if (googleUser?.emailVerified && data.assignment) {
        void runCloudTask(async () => {
          await upsertAssignmentInFirestore(googleUser, data.assignment);
          for (const veh of (data.state as AppStateResponse).vehicles) {
            await upsertVehicleInFirestore(googleUser, veh);
          }
        });
      }

      const token = getAccessToken();
      const sheetId = data.state.config.spreadsheetId;
      if (token && sheetId) {
        try {
          await pushAssignmentsToSpreadsheet(
            token,
            sheetId,
            data.state.assignments
          );
          await pushVehiclesToSpreadsheet(token, sheetId, data.state.vehicles);
          await fetch('/api/sync/mark-pushed', { method: 'POST' });
        } catch {
          // Will be pushed on next sync
        }
      }

      return notif;
    } catch {
      addToast(
        'error',
        'Kesalahan Jaringan',
        'Gagal mengirim data keberangkatan.'
      );
      return null;
    }
  };

  const handleDriverHandover = async (
    assignmentId: string,
    payload: {
      kmAkhir: number;
      suhuAkhir: string;
      bbmAkhir: string;
      penerimaNama: string;
      kondisiAkhir: string;
      catatanSerahTerima: string;
      fotoOdometerSerahTerima?: string;
      fotoSuhuSerahTerima?: string;
      fotoBuktiSerahTerima?: string;
      tandaTanganPenerima?: string;
    },
    waTargetMode: WhatsAppTargetMode
  ): Promise<WhatsAppNotificationLog | null> => {
    try {
      const res = await fetch(
        `/api/assignments/${encodeURIComponent(assignmentId)}/handover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        addToast('error', 'Gagal Mengirim Data Serah Terima', data.error);
        return null;
      }

      const notif = data.notification as WhatsAppNotificationLog;
      if (notif) {
        const targetUrl =
          waTargetMode === 'GROUP'
            ? notif.waGroupUrl || buildWhatsAppGroupUrl(notif.message)
            : buildWhatsAppDirectUrl(
                data.state?.config?.dispatcherWaPhone || '',
                notif.message,
                false
              );
        // Open WhatsApp immediately in 1 click before slow cloud Sheets sync
        launchWhatsAppUrl(targetUrl);
      }

      setAppState(data.state);
      addToast(
        'success',
        'Serah Terima Selesai & Membuka WhatsApp',
        waTargetMode === 'GROUP'
          ? 'Pilih Grup WhatsApp tujuan untuk mengirim berita acara serah terima.'
          : 'Membuka chat WhatsApp Dispatcher secara otomatis.'
      );

      if (googleUser?.emailVerified && data.assignment) {
        void runCloudTask(async () => {
          await upsertAssignmentInFirestore(googleUser, data.assignment);
          for (const veh of (data.state as AppStateResponse).vehicles) {
            await upsertVehicleInFirestore(googleUser, veh);
          }
        });
      }

      const token = getAccessToken();
      const sheetId = data.state.config.spreadsheetId;
      if (token && sheetId) {
        try {
          await pushAssignmentsToSpreadsheet(
            token,
            sheetId,
            data.state.assignments
          );
          await pushVehiclesToSpreadsheet(token, sheetId, data.state.vehicles);
          await fetch('/api/sync/mark-pushed', { method: 'POST' });
        } catch {
          // Will be pushed on next sync
        }
      }

      return notif;
    } catch {
      addToast(
        'error',
        'Kesalahan Jaringan',
        'Gagal mengirim data serah terima.'
      );
      return null;
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast('success', 'Berhasil Disalin', `${label} disalin ke papan klip.`);
    } catch {
      addToast('error', 'Gagal Menyalin', 'Tidak dapat mengakses clipboard.');
    }
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-3 text-center">
          <div className="mx-auto h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mx-auto h-4 w-64 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <>
      {sessionRole === null && (
        <LoginPage
          drivers={appState.drivers}
          vehicles={appState.vehicles}
          assignments={appState.assignments}
          config={appState.config}
          googleUser={googleUser}
          hasGoogleToken={hasGoogleToken}
          isSyncing={isSyncing}
          onRefreshSync={async () => {
            await syncWithGoogleSheets(undefined, false);
          }}
          onGoogleLogin={handleGoogleLogin}
          onDriverLoginSuccess={(driver) => {
            setLoggedInDriver(driver);
            setSessionRole(UserRole.DRIVER);
            addToast(
              'success',
              `Selamat Datang, ${driver.name}`,
              `Masuk ke CRK LOGISTIK DELIVERY SISTEM (${driver.id}).`
            );
          }}
          onAdminLoginSuccess={() => {
            setSessionRole(UserRole.ADMIN);
            addToast(
              'success',
              'CRK LOGISTIK DELIVERY SISTEM',
              'Selamat datang di Portal Admin Dispatcher Rantai Dingin.'
            );
          }}
        />
      )}

      {sessionRole === UserRole.DRIVER && loggedInDriver && (
        <DriverPortal
          driver={loggedInDriver}
          assignments={appState.assignments}
          routes={appState.routes}
          config={appState.config}
          isSyncing={isSyncing}
          onRefreshSync={async () => {
            await syncWithGoogleSheets(undefined, false);
          }}
          onSubmitDeparture={handleDriverDeparture}
          onSubmitHandover={handleDriverHandover}
          onCopyText={handleCopyText}
          onLogout={() => {
            setSessionRole(null);
            setLoggedInDriver(null);
          }}
        />
      )}

      {sessionRole === UserRole.ADMIN && (
        <AdminPortal
          drivers={appState.drivers}
          vehicles={appState.vehicles}
          origins={appState.origins}
          routes={appState.routes}
          assignments={appState.assignments}
          notifications={appState.notifications}
          config={appState.config}
          googleUser={googleUser}
          hasGoogleToken={hasGoogleToken}
          isSyncing={isSyncing}
          onGoogleLogin={handleGoogleLogin}
          onGoogleLogout={handleGoogleLogout}
          onManualSync={async () => {
            await syncWithGoogleSheets(undefined, false);
          }}
          onConnectSpreadsheet={handleConnectSpreadsheet}
          onCreateSpreadsheet={handleCreateSpreadsheet}
          onCreateAssignment={handleCreateAssignment}
          onUpdateAssignment={handleUpdateAssignment}
          onDeleteAssignment={handleDeleteAssignment}
          onSaveDriver={handleSaveDriver}
          onDeleteDriver={handleDeleteDriver}
          onSaveVehicle={handleSaveVehicle}
          onDeleteVehicle={handleDeleteVehicle}
          onSaveOrigin={handleSaveOrigin}
          onDeleteOrigin={handleDeleteOrigin}
          onSaveRoute={handleSaveRoute}
          onDeleteRoute={handleDeleteRoute}
          onSaveOperationalSettings={handleSaveOperationalSettings}
          onTestWhatsAppNetwork={handleTestWhatsAppNetwork}
          onChangeAdminPin={handleChangeAdminPin}
          onCopyText={handleCopyText}
          onLogout={() => {
            setSessionRole(null);
          }}
        />
      )}

      <div className="no-print">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </>
  );
}
