import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import LogoBuild, { BUILD_DURATION } from "../components/LogoBuild";
import LoadingStroke from "../components/LoadingStroke";
import useReducedMotion from "../hooks/useReducedMotion";
import { markSplashDone } from "../utils/splashGate";

// Start-up overlay on a light background: the CP tower is built floor by floor (crane and
// scaffolding), the C and P draw in beside it, then the wordmark; a loading line runs beneath. It leaves only once the logo has settled AND `ready` (app initialisation)
// is true. App.js mounts it once at launch, so it never replays during navigation.
export default function SplashScreen({ ready, onFinish }) {
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const exit = useSharedValue(1);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const size = Math.round(Math.min(W * 0.46, H * 0.26, 180));

  const finish = useCallback(() => finishRef.current?.(), []);
  const leave = useCallback(() => {
    // Screens underneath start their entrance as the splash fades, so it plays in view.
    markSplashDone();
    exit.value = withTiming(0, { duration: 360 }, (done) => {
      if (done) runOnJS(finish)();
    });
  }, [exit, finish]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.value }));

  return (
    <Animated.View
      style={[styles.root, rootStyle]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="CompareProjects is loading"
    >
      <StatusBar style="dark" />
      <LinearGradient colors={["#FFFFFF", "#F4F7FF", "#EAF0FF"]} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <LogoBuild size={size} reduced={reduced} onRevealed={() => setRevealed(true)} />
        <LoadingStroke
          width={Math.round(size * 0.9)}
          duration={reduced ? 600 : BUILD_DURATION - 100}
          ready={ready && revealed}
          onComplete={leave}
          style={{ marginTop: 16 }}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: "#FFFFFF", zIndex: 100 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
