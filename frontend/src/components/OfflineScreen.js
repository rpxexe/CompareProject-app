import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { useNetwork } from "../context/NetworkContext";
import { isReducedMotion } from "../hooks/useReducedMotion";
import PressableScale from "./PressableScale";
import Text from "./AppText";
import { brand, colors, gradients, radius } from "../theme";

// Offline only shows the page if it lasts longer than this, so a brief blip doesn't flash it.
const GRACE_MS = 900;
// When the connection returns, the city's windows light up for this long before the page leaves.
const LIGHTS_MS = 700;

const ART = 220; // illustration box
const CX = ART / 2;
const WIFI_Y = 104; // centre of the Wi-Fi arcs

const arc = (r) => {
  const d = r * Math.SQRT1_2;
  return `M ${CX - d} ${WIFI_Y - d} A ${r} ${r} 0 0 1 ${CX + d} ${WIFI_Y - d}`;
};
const ARCS = [24, 42, 60];

// Small skyline across the bottom of the illustration circle (x, width, height).
const TOWERS = [
  [22, 26, 46], [50, 20, 64], [72, 30, 40], [104, 22, 74], [128, 28, 52], [158, 20, 66], [180, 26, 38],
];
const BASE = 192;
const windowsFor = ([x, w, h]) => {
  let d = "";
  for (let y = BASE - h + 8; y < BASE - 6; y += 9) d += `M${x + 5} ${y}H${x + w - 5}`;
  return d;
};
const WINDOWS = TOWERS.map(windowsFor).join("");

function Illustration({ lightsOn }) {
  // Wi-Fi arcs light up inner → outer, over and over: "searching for a signal".
  const scan = useRef(new Animated.Value(0)).current;
  const lights = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isReducedMotion()) return undefined;
    const a = Animated.loop(Animated.timing(scan, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lightsOn) return;
    if (isReducedMotion()) lights.setValue(1);
    else Animated.timing(lights, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [lightsOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each arc brightens in its slice of the scan cycle; all arcs light fully once back online.
  const arcOpacity = (i) =>
    lightsOn
      ? 1
      : scan.interpolate({
          inputRange: [0, 0.15 + i * 0.2, 0.3 + i * 0.2, 0.75, 1],
          outputRange: [0.18, 0.18, 1, 0.18, 0.18],
          extrapolate: "clamp",
        });

  const layer = { position: "absolute", left: 0, top: 0, width: ART, height: ART };

  return (
    <View style={{ width: ART, height: ART }}>
      <Svg width={ART} height={ART}>
        <Defs>
          <ClipPath id="offCircle">
            <Circle cx={CX} cy={ART / 2} r={96} />
          </ClipPath>
        </Defs>
        <Circle cx={CX} cy={ART / 2} r={96} fill="#E9F0FF" />
        <G clipPath="url(#offCircle)">
          {TOWERS.map(([x, w, h]) => (
            <Rect key={x} x={x} y={BASE - h} width={w} height={h + 20} rx={3} fill="#C9D7FF" />
          ))}
          {/* Windows: dark while offline. */}
          <Path d={WINDOWS} stroke="#B3C5F5" strokeWidth={2.5} strokeLinecap="round" />
        </G>
      </Svg>
      {/* Windows lit when the connection comes back. */}
      <Animated.View style={[layer, { opacity: lights }]} pointerEvents="none">
        <Svg width={ART} height={ART}>
          <Defs>
            <ClipPath id="offCircle2">
              <Circle cx={CX} cy={ART / 2} r={96} />
            </ClipPath>
          </Defs>
          <G clipPath="url(#offCircle2)">
            <Path d={WINDOWS} stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
          </G>
        </Svg>
      </Animated.View>
      {/* A cloud drifting past. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", left: 30, top: 34 },
          { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] },
        ]}
      >
        <Svg width={52} height={24}>
          <Path d="M10 22 a8 8 0 0 1 2 -15.8 a11 11 0 0 1 21 -1.5 a8.5 8.5 0 1 1 7 17.3 Z" fill="#FFFFFF" />
        </Svg>
      </Animated.View>
      {ARCS.map((r, i) => (
        <Animated.View key={r} style={[layer, { opacity: arcOpacity(i) }]} pointerEvents="none">
          <Svg width={ART} height={ART}>
            <Path d={arc(r)} stroke={brand.violet} strokeWidth={9} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      ))}
      <View pointerEvents="none" style={[layer]}>
        <Svg width={ART} height={ART}>
          <Circle cx={CX} cy={WIFI_Y} r={7} fill={brand.violet} />
        </Svg>
      </View>
    </View>
  );
}

const TIPS = [
  { icon: "wifi-outline", text: "Wi-Fi or mobile data is turned on" },
  { icon: "airplane-outline", text: "Airplane mode is off" },
  { icon: "cellular-outline", text: "You have enough signal" },
];

// Full-screen "You're offline" page. Appears when the device has been offline for a moment,
// stays until the connection returns (Try again asks the OS to re-check), then lights the city's
// windows and fades away. Sits above every screen, the splash included.
export default function OfflineScreen() {
  const { offline, checking, retry } = useNetwork();
  const { top, bottom } = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [lightsOn, setLightsOn] = useState(false);
  const show = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  // Offline (after the grace period) → show. Online again → lights on, then hide.
  useEffect(() => {
    if (offline) {
      setLightsOn(false);
      const id = setTimeout(() => setVisible(true), GRACE_MS);
      return () => clearTimeout(id);
    }
    if (!visible) return undefined;
    setLightsOn(true);
    const id = setTimeout(() => setVisible(false), LIGHTS_MS);
    return () => clearTimeout(id);
  }, [offline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isReducedMotion()) {
      show.setValue(visible ? 1 : 0);
      return;
    }
    if (visible) Animated.spring(show, { toValue: 1, stiffness: 160, damping: 18, mass: 0.9, useNativeDriver: true }).start();
    else Animated.timing(show, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const tryAgain = async () => {
    const ok = await retry();
    if (ok || isReducedMotion()) return;
    // Still offline: a small shake so the tap clearly did something.
    shake.setValue(0);
    Animated.sequence(
      [1, -1, 0.7, -0.7, 0.3, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 60, useNativeDriver: true })),
    ).start();
  };

  const openWifi = () => {
    Linking.sendIntent?.("android.settings.WIFI_SETTINGS").catch(() => Linking.openSettings());
  };

  const rise = (from) => ({
    opacity: show,
    transform: [{ translateY: show.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.root, { opacity: show }]}
      accessibilityViewIsModal={visible}
      importantForAccessibility={visible ? "yes" : "no-hide-descendants"}
    >
      <LinearGradient colors={["#FFFFFF", "#F4F7FF", "#EAF0FF"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.body, { paddingTop: top + 24, paddingBottom: bottom + 24 }]}>
        <Animated.View style={[styles.art, { transform: [{ scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
          <Illustration lightsOn={lightsOn} />
        </Animated.View>

        <Animated.View style={rise(16)}>
          <Text style={styles.title} accessibilityRole="header">
            {lightsOn ? "You're back online" : "You're offline"}
          </Text>
          <Text style={styles.text}>
            {lightsOn ? "Reconnected. Taking you back…" : "We can't reach the internet right now. Check your connection and try again."}
          </Text>
        </Animated.View>

        <Animated.View style={[styles.tips, rise(24)]}>
          {TIPS.map((t) => (
            <View key={t.text} style={styles.tip}>
              <View style={styles.tipIcon}>
                <Ionicons name={t.icon} size={15} color={brand.violet} />
              </View>
              <Text style={styles.tipText}>{t.text}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.actions, rise(32)]}>
          <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }] }}>
            <PressableScale
              onPress={tryAgain}
              disabled={checking}
              to={0.97}
              accessibilityRole="button"
              accessibilityLabel={checking ? "Checking connection" : "Try again"}
            >
              <LinearGradient colors={gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
                {checking ? (
                  <>
                    <ActivityIndicator size="small" color={colors.white} />
                    <Text style={styles.primaryText}>Checking…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="refresh" size={18} color={colors.white} />
                    <Text style={styles.primaryText}>Try again</Text>
                  </>
                )}
              </LinearGradient>
            </PressableScale>
          </Animated.View>
          {Platform.OS === "android" ? (
            <PressableScale onPress={openWifi} to={0.97} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Open Wi-Fi settings">
              <Ionicons name="settings-outline" size={16} color={brand.violet} />
              <Text style={styles.secondaryText}>Open Wi-Fi settings</Text>
            </PressableScale>
          ) : null}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 250, elevation: 25 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  art: { alignSelf: "center", marginBottom: 18 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", color: brand.ink, textAlign: "center", letterSpacing: -0.5 },
  text: { fontSize: 14.5, lineHeight: 21, color: brand.inkSoft, textAlign: "center", marginTop: 8, paddingHorizontal: 6 },
  tips: { marginTop: 22, gap: 10, alignSelf: "center" },
  tip: { flexDirection: "row", alignItems: "center", gap: 10 },
  tipIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#EAF0FF", alignItems: "center", justifyContent: "center" },
  tipText: { fontSize: 13.5, fontWeight: "600", color: brand.ink },
  actions: { marginTop: 28, gap: 12 },
  primary: { height: 52, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { fontSize: 15, fontWeight: "800", color: colors.white },
  secondary: { height: 46, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.2, borderColor: "rgba(36, 87, 255, 0.25)", backgroundColor: colors.white },
  secondaryText: { fontSize: 14, fontWeight: "700", color: brand.violet },
});
