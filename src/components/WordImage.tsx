import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

interface Props {
  uri: string | null;
  style?: object;
  iconSize?: number;
}

/**
 * Renders a word's illustration, which is either:
 * - a local photo file URI (from the parent's photo library), or
 * - a bundled vector illustration, stored as `icon:<IoniconsName>`.
 * Falls back to a soft placeholder when there is nothing to show.
 */
export default function WordImage({ uri, style, iconSize = 56 }: Props) {
  const { colors: c } = useTheme();
  const placeholderStyle = StyleSheet.flatten([
    { backgroundColor: c.accentSoft },
    styles.placeholder,
    style,
  ]);
  if (!uri) {
    return (
      <View style={placeholderStyle}>
        <Ionicons name="image-outline" size={iconSize} color={c.tabInactive} />
      </View>
    );
  }
  if (uri.startsWith('icon:')) {
    const name = uri.slice(5) as React.ComponentProps<typeof Ionicons>['name'];
    return (
      <View style={placeholderStyle}>
        <Ionicons name={name} size={iconSize} color={c.primaryDeep} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.photo, style]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {},
});
