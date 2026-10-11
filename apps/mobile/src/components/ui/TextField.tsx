import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input({ label, error, hint, style, ...rest }, ref) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

interface FieldProps<T extends FieldValues> extends Omit<InputProps, 'value' | 'onChangeText' | 'error'> {
  control: Control<T>;
  name: FieldPath<T>;
}

export function TextField<T extends FieldValues>({ control, name, ...rest }: FieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value, ref }, fieldState }) => (
        <Input
          ref={ref}
          value={value ?? ''}
          onChangeText={onChange}
          onBlur={onBlur}
          error={fieldState.error?.message}
          {...rest}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1 },
});
