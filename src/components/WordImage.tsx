import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

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
  if (!uri) {
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name="image-outline" size={iconSize} color="#C9AFB4" />
      </View>
    );
  }
  if (uri.startsWith('icon:')) {
    const name = uri.slice(5) as React.ComponentProps<typeof Ionicons>['name'];
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name={name} size={iconSize} color={colors.primaryDeep} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.photo, style]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {},
});
