import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  size: number;
  backgroundColor: string;
  children: React.ReactNode;
  style?: object;
}

/** A centered circular wrapper — used to frame a word's image or icon. */
export default function CircleFrame({ size, backgroundColor, children, style }: Props) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
