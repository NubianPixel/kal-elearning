import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  /** 0-100. Clamped. */
  pct: number;
  trackColor: string;
  fillColor: string;
  height?: number;
}

/** A rounded progress track + fill, themed by the caller. */
export default function ProgressBar({ pct, trackColor, fillColor, height = 7 }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = height / 2;
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: radius }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped}%`, backgroundColor: fillColor, height, borderRadius: radius },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: {},
});
