import React from 'react';
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native';
import { primaryButton, useTheme, type ThemeColors } from '../../../theme';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  answered: boolean;
  placeholder?: string;
}

/** A text answer field + submit button — shared by recall, drill and grammar/reading "type" questions. */
export default function TypedAnswerInput({ value, onChange, onSubmit, answered, placeholder }: Props) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);

  return (
    <View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? 'Type your answer'}
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!answered}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
        accessibilityLabel="Your answer"
      />
      {!answered && (
        <Pressable
          style={[primaryButton, styles.submit, !value.trim() && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={!value.trim()}
          accessibilityLabel="Check answer"
        >
          <Text style={styles.submitText}>Check</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    input: {
      borderWidth: 2,
      borderColor: c.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 18,
      fontWeight: '600',
      color: c.text,
      backgroundColor: c.card,
    },
    submit: { backgroundColor: c.primary, minHeight: 52 },
    submitDisabled: { opacity: 0.5 },
    submitText: { fontSize: 17, fontWeight: '800', color: c.onPrimary },
  });
