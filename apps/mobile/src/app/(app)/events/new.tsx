import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, Chip, ErrorState, Screen, TextField } from '@/components/ui';
import { useLocations } from '@/features/org/api';
import { useActiveOrgId } from '@/features/org/OrgProvider';
import { useCreateEvent } from '@/features/work/api';
import { deviceTimeZone, parseLocalInput, toLocalInput } from '@/features/work/format';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';

const when = z.string().refine((v) => parseLocalInput(v) !== null, 'Use YYYY-MM-DD HH:mm');
const formSchema = z
  .object({ title: z.string().trim().min(1, 'Title is required').max(200), description: z.string().max(5000), startAt: when, endAt: when })
  .refine((v) => {
    const s = parseLocalInput(v.startAt);
    const e = parseLocalInput(v.endAt);
    return !s || !e || Date.parse(e) > Date.parse(s);
  }, { message: 'End must be after start', path: ['endAt'] });
type Form = z.infer<typeof formSchema>;

function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 24);
  return { startAt: toLocalInput(start), endAt: toLocalInput(new Date(start.getTime() + 3 * 3_600_000)) };
}

export default function NewEvent() {
  const orgId = useActiveOrgId();
  const { spacing } = useTheme();
  const create = useCreateEvent(orgId);
  const locations = useLocations(orgId);
  const [locationId, setLocationId] = useState<string | undefined>();
  const { control, handleSubmit } = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: '', description: '', ...defaultTimes() },
  });
  const locs = locations.data?.pages.flatMap((p) => p.data) ?? [];

  const onSubmit = handleSubmit((f) =>
    create.mutate(
      {
        title: f.title,
        description: f.description.trim() || undefined,
        startAt: parseLocalInput(f.startAt)!,
        endAt: parseLocalInput(f.endAt)!,
        timezone: deviceTimeZone(),
        locationId,
        priority: 'NORMAL',
      },
      { onSuccess: (event) => router.replace(`/events/${event.id}`) },
    ),
  );

  return (
    <Screen>
      <TextField control={control} name="title" label="Title" placeholder="e.g. Annual gala" />
      <TextField control={control} name="description" label="Description (optional)" multiline />
      <TextField control={control} name="startAt" label="Starts" placeholder="YYYY-MM-DD HH:mm" autoCapitalize="none" />
      <TextField control={control} name="endAt" label="Ends" placeholder="YYYY-MM-DD HH:mm" hint={`Times are in ${deviceTimeZone()}`} autoCapitalize="none" />
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
      <AppText tone="muted">New events start as drafts that staff cannot see until you publish.</AppText>
      {create.error ? <ErrorState message={errorMessage(create.error)} /> : null}
      <Button label="Create event" onPress={onSubmit} loading={create.isPending} />
    </Screen>
  );
}
