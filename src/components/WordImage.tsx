import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

interface Props {
  /** A local photo file URI, a bundled `require()` asset id (content
   *  images from src/content/media.ts), `icon:<IoniconsName>`, or null. */
  uri: string | number | null;
  style?: object;
  iconSize?: number;
}

/**
 * Renders a word's illustration, which is either:
 * - a local photo file URI (from the parent's photo library), or
 * - a bundled content image (require() asset id), or
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
  if (uri == null) {
    return (
      <View style={placeholderStyle}>
        <Ionicons name="image-outline" size={iconSize} color={c.tabInactive} />
      </View>
    );
  }
  if (typeof uri === 'number') {
    return <Image source={uri} style={[styles.photo, style]} />;
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
