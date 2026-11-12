import React, { useEffect, useState } from "react";
import { Image, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SPRING = { duration: 220 };

// One photo in the full-screen viewer, zoomable:
//   - pinch to zoom (1x-4x) around the fingers,
//   - double tap to zoom in on that spot / back out,
//   - drag to look around while zoomed (kept inside the photo's edges).
// At 1x one-finger drags are left alone so the viewer's list can swipe between photos;
// `onZoomChange(true|false)` tells the viewer to lock that swipe while zoomed.
// `active` false (swiped away) resets the zoom.
export default function ZoomableImage({ uri, width, height, active, onZoomChange }) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ s: 1, x: 0, y: 0, fx: 0, fy: 0 });
  // The photo's drawn size (it's letterboxed with "contain"); panning stops at its edges.
  const fit = useSharedValue({ w: width, h: height });
  const [natural, setNatural] = useState(null);

  useEffect(() => {
    if (!natural) return;
    const k = Math.min(width / natural.w, height / natural.h);
    fit.value = { w: natural.w * k, h: natural.h * k };
  }, [natural, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) return;
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useAnimatedReaction(
    () => scale.value > 1.01,
    (zoomed, was) => {
      if (zoomed !== was && onZoomChange) runOnJS(onZoomChange)(zoomed);
    },
  );

  // How far the photo may move at scale `s` before an edge comes into view.
  const bound = (s, axis) => {
    "worklet";
    const size = axis === "x" ? fit.value.w : fit.value.h;
    const box = axis === "x" ? width : height;
    return Math.max(0, (size * s - box) / 2);
  };
  const clamp = (v, m) => {
    "worklet";
    return Math.min(m, Math.max(-m, v));
  };
  // Settle: below 1x snaps back to fit; otherwise caps the scale and pulls the photo inside its edges.
  const settle = () => {
    "worklet";
    const s = Math.min(MAX_SCALE, Math.max(1, scale.value));
    scale.value = withTiming(s, SPRING);
    tx.value = withTiming(s === 1 ? 0 : clamp(tx.value, bound(s, "x")), SPRING);
    ty.value = withTiming(s === 1 ? 0 : clamp(ty.value, bound(s, "y")), SPRING);
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      start.value = { s: scale.value, x: tx.value, y: ty.value, fx: e.focalX - width / 2, fy: e.focalY - height / 2 };
    })
    .onUpdate((e) => {
      const { s: s0, x, y, fx, fy } = start.value;
      // A little give past the limits, settled back on release.
      const s = Math.min(MAX_SCALE * 1.25, Math.max(0.8, s0 * e.scale));
      // Keep the point between the fingers under the fingers.
      tx.value = fx - (fx - x) * (s / s0);
      ty.value = fy - (fy - y) * (s / s0);
      scale.value = s;
    })
    .onEnd(settle);

  // Only takes over a drag while zoomed in; at 1x it steps aside for the list's swipe.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((e, state) => {
      if (scale.value > 1.01) state.activate();
      else state.fail();
    })
    .onStart(() => {
      start.value = { ...start.value, x: tx.value, y: ty.value };
    })
    .onUpdate((e) => {
      tx.value = clamp(start.value.x + e.translationX, bound(scale.value, "x"));
      ty.value = clamp(start.value.y + e.translationY, bound(scale.value, "y"));
    })
    .onEnd(settle);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.01) {
        scale.value = withTiming(1, SPRING);
        tx.value = withTiming(0, SPRING);
        ty.value = withTiming(0, SPRING);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      scale.value = withTiming(s, SPRING);
      tx.value = withTiming(clamp(-(e.x - width / 2) * (s - 1), bound(s, "x")), SPRING);
      ty.value = withTiming(clamp(-(e.y - height / 2) * (s - 1), bound(s, "y")), SPRING);
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[{ width, height }, styles.page]}
        accessible
        accessibilityHint="Pinch or double tap to zoom"
      >
        <Animated.View style={[StyleSheet.absoluteFill, style]}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoad={(e) => {
              const src = e.nativeEvent?.source;
              if (src?.width && src?.height) setNatural({ w: src.width, h: src.height });
            }}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: { overflow: "hidden" },
});
