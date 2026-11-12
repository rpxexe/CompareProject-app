import React, { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cover } from "./PropertyCard";
import ZoomableImage from "./ZoomableImage";
import { colors } from "../theme";
import Text from "./AppText";

const THUMB = 56;
const THUMB_GAP = 8;

// Full-screen photo preview: swipe between photos (full resolution, letterboxed on black), a
// "3 / 12" counter, a close button, and a thumbnail strip to jump straight to any photo.
// Each photo zooms (pinch / double tap, see ZoomableImage); swiping is locked while zoomed.
// Opens on `index`; `onClose(lastIndex)` reports where the user stopped. Android back closes it.
export default function ImageViewer({ images, index, visible, onClose }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(index || 0);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef(null);
  const thumbsRef = useRef(null);

  // Every opening starts on the photo that was tapped.
  useEffect(() => {
    if (visible) {
      setI(index || 0);
      setZoomed(false);
    }
  }, [visible, index]);

  // Keep the active thumbnail in view.
  useEffect(() => {
    if (!visible || images.length < 2) return;
    thumbsRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
  }, [i, visible, images.length]);

  const jump = (n) => {
    setI(n);
    setZoomed(false);
    listRef.current?.scrollToOffset({ offset: n * width, animated: true });
  };
  const close = () => onClose?.(i);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent supportedOrientations={["portrait"]}>
      <StatusBar style="light" />
      {/* Gesture Handler needs its own root inside a Modal on Android. */}
      <GestureHandlerRootView style={styles.root}>
        {visible ? (
          <FlatList
            ref={listRef}
            data={images}
            keyExtractor={(u, k) => `${k}:${u}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!zoomed}
            initialScrollIndex={Math.min(index || 0, Math.max(images.length - 1, 0))}
            getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
            onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
            extraData={i}
            renderItem={({ item, index: k }) => (
              <ZoomableImage uri={item} width={width} height={height} active={k === i} onZoomChange={k === i ? setZoomed : undefined} />
            )}
          />
        ) : null}

        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={close} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close photos">
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          {images.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>{`${i + 1} / ${images.length}`}</Text>
            </View>
          ) : null}
        </View>

        {images.length > 1 ? (
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
            <FlatList
              ref={thumbsRef}
              data={images}
              keyExtractor={(u, k) => `t${k}:${u}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbs}
              getItemLayout={(_, k) => ({ length: THUMB + THUMB_GAP, offset: 16 + (THUMB + THUMB_GAP) * k, index: k })}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index: k }) => (
                <Pressable
                  onPress={() => jump(k)}
                  style={[styles.thumb, k === i && styles.thumbOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Show photo ${k + 1}`}
                  accessibilityState={{ selected: k === i }}
                >
                  <Cover uri={item} style={styles.thumbImg} iconSize={18} />
                </Pressable>
              )}
            />
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.16)" },
  counter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255, 255, 255, 0.16)" },
  counterText: { fontSize: 13, fontWeight: "800", color: colors.white },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 12, backgroundColor: "rgba(0, 0, 0, 0.45)" },
  thumbs: { paddingHorizontal: 16, gap: THUMB_GAP },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent", opacity: 0.6 },
  thumbOn: { borderColor: colors.white, opacity: 1 },
  thumbImg: { width: "100%", height: "100%" },
});
