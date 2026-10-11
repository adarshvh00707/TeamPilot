import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  /** Safe-area edges to pad. Screens under a native header/tab bar should omit 'top'/'bottom'. */
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({ children, scroll = true, edges = ['left', 'right'], refreshing, onRefresh }: Props) {
  const { colors, spacing } = useTheme();
  const content = { padding: spacing.lg, gap: spacing.lg };
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[content, styles.grow]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, content]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
