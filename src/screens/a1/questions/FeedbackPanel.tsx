import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, primaryButton, useTheme, type ThemeColors } from '../../../theme';

interface Props {
  correct: boolean;
  /** The right answer text; shown when the learner got it wrong. */
  correctAnswer?: string;
  /** Optional usage note (item.note) or authored explanation (question.explanation). */
  note?: string | null;
  onContinue: () => void;
}

/** Correct/wrong feedback + the right answer + note/explanation + tap-to-continue. Shared by Review and Checkpoint. */
export default function FeedbackPanel({ correct, correctAnswer, note, onContinue }: Props) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);

  return (
    <View style={[styles.panel, correct ? styles.panelCorrect : styles.panelWrong]}>
      <View style={styles.headerRow}>
        <Ionicons
          name={correct ? 'checkmark-circle' : 'close-circle'}
          size={24}
          color={correct ? c.correct : c.wrong}
        />
        <Text style={[styles.headerText, { color: correct ? c.correct : c.wrong }]}>
          {correct ? 'Ke botlhale!' : 'Not quite'}
        </Text>
      </View>
      {!correct && correctAnswer ? (
        <Text style={styles.answerText}>Correct answer: {correctAnswer}</Text>
      ) : null}
      {note ? <Text style={styles.noteText}>{note}</Text> : null}
      <Pressable style={[primaryButton, styles.continueButton]} onPress={onContinue} accessibilityLabel="Continue">
        <Text style={styles.continueText}>Continue</Text>
        <Ionicons name="arrow-forward" size={20} color={c.onAccent} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: {
      borderRadius: 22,
      padding: 16,
      marginTop: 14,
      ...cardShadow(c, 'md'),
    },
    panelCorrect: { backgroundColor: c.primarySoft },
    panelWrong: { backgroundColor: c.wrongSoft },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerText: { fontSize: 18, fontWeight: '800' },
    answerText: { marginTop: 8, fontSize: 15, fontWeight: '700', color: c.text },
    noteText: { marginTop: 6, fontSize: 14, fontWeight: '600', color: c.muted },
    continueButton: {
      backgroundColor: c.accent,
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
      marginBottom: 0,
      alignSelf: 'stretch',
    },
    continueText: { fontSize: 17, fontWeight: '800', color: c.onAccent },
  });
