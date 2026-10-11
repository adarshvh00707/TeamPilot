import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, Chip, ErrorState, Screen, TextField } from '@/components/ui';
import { useLocations } from '@/features/org/api';
import { useActiveOrgId } from '@/features/org/OrgProvider';
import { useCreateTask } from '@/features/work/api';
import { parseLocalInput } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const formSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(5000),
  requiredHeadcount: z
    .string()
    .regex(/^\d+$/, 'Enter a whole number')
    .refine((v) => Number(v) >= 1 && Number(v) <= 500, 'Between 1 and 500'),
  estimatedDurationMinutes: z.string().regex(/^(\d+)?$/, 'Enter minutes as a whole number'),
  completionDeadline: z.string().refine((v) => !v.trim() || parseLocalInput(v) !== null, 'Use YYYY-MM-DD HH:mm'),
  instructions: z.string().max(5000),
});
type Form = z.infer<typeof formSchema>;

export default function NewTask() {
  const orgId = useActiveOrgId();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const { spacing } = useTheme();
  const create = useCreateTask(orgId);
  const locations = useLocations(orgId);
  const [locationId, setLocationId] = useState<string | undefined>();
  const { control, handleSubmit } = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: '', description: '', requiredHeadcount: '1', estimatedDurationMinutes: '', completionDeadline: '', instructions: '' },
  });

  const onSubmit = handleSubmit((f) =>
    create.mutate(
      {
        title: f.title,
        description: f.description.trim() || undefined,
        requiredHeadcount: Number(f.requiredHeadcount),
        estimatedDurationMinutes: f.estimatedDurationMinutes ? Number(f.estimatedDurationMinutes) : undefined,
        completionDeadline: f.completionDeadline.trim() ? parseLocalInput(f.completionDeadline)! : undefined,
        instructions: f.instructions.trim() || undefined,
        locationId,
        eventId: eventId || undefined,
        priority: 'NORMAL',
        offerResponseWindowMinutes: 10,
        requiredSkills: [],
      },
      { onSuccess: (task) => router.replace(`/tasks/${task.id}`) },
    ),
  );

  const locs = locations.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Screen>
      <TextField control={control} name="title" label="Title" placeholder="e.g. Reset chairs in Atrium" />
      <TextField control={control} name="description" label="Description (optional)" multiline />
      <TextField control={control} name="requiredHeadcount" label="People needed" keyboardType="number-pad" />
      <TextField control={control} name="estimatedDurationMinutes" label="Estimated minutes (optional)" keyboardType="number-pad" />
      <TextField
        control={control}
        name="completionDeadline"
        label="Deadline (optional)"
        placeholder="YYYY-MM-DD HH:mm"
        hint="Your device's local time"
        autoCapitalize="none"
      />
      <TextField control={control} name="instructions" label="Instructions for staff (optional)" multiline />
      {locs.length ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">Location (optional)</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {locs.map((l) => (
              <Chip key={l.id} label={l.name} selected={locationId === l.id} onPress={() => setLocationId(locationId === l.id ? undefined : l.id)} />
            ))}
          </View>
        </View>
      ) : null}
      <AppText tone="muted">New tasks start as drafts. Schedule the task when it is ready, then assign people.</AppText>
      {create.error ? <ErrorState message={errorMessage(create.error)} /> : null}
      <Button label="Create task" onPress={onSubmit} loading={create.isPending} />
    </Screen>
  );
}
