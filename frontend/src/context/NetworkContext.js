import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

// Device connectivity for the whole app. `offline` is true when there is no network at all, or
// when the OS has checked and the network can't reach the internet (e.g. Wi-Fi with no
// broadband). An unknown reachability (null, still being checked) counts as online, so the app
// never claims to be offline without evidence.
const NetworkContext = createContext({ offline: false, checking: false, retry: () => {}, onReconnect: () => () => {} });

export const useNetwork = () => useContext(NetworkContext);

const isOffline = (s) => !!s && (s.isConnected === false || s.isInternetReachable === false);

export function NetworkProvider({ children }) {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const reconnectSubs = useRef(new Set()).current;
  const wasOffline = useRef(false);

  const apply = useCallback(
    (s) => {
      const now = isOffline(s);
      setOffline(now);
      // Offline → online: let screens refresh what failed to load.
      if (wasOffline.current && !now) reconnectSubs.forEach((f) => f());
      wasOffline.current = now;
    },
    [reconnectSubs],
  );

  useEffect(() => {
    NetInfo.fetch().then(apply).catch(() => {});
    return NetInfo.addEventListener(apply);
  }, [apply]);

  // Asks the OS to re-check now (the offline page's Try again). Resolves to true when online.
  const retry = useCallback(async () => {
    setChecking(true);
    try {
      const s = await NetInfo.refresh();
      apply(s);
      return !isOffline(s);
    } catch {
      return false;
    } finally {
      setChecking(false);
    }
  }, [apply]);

  // Subscribe to "connection is back"; returns an unsubscribe function.
  const onReconnect = useCallback(
    (fn) => {
      reconnectSubs.add(fn);
      return () => reconnectSubs.delete(fn);
    },
    [reconnectSubs],
  );

  const value = useMemo(() => ({ offline, checking, retry, onReconnect }), [offline, checking, retry, onReconnect]);
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}
