import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLocationSchema } from '@teampilot/shared';
import { z } from 'zod';
import { Button, ErrorState, Screen, TextField } from '@/components/ui';
import { useCreateLocation } from '@/features/org/api';
import { useActiveOrgId } from '@/features/org/OrgProvider';
import { errorMessage } from '@/lib/api';

const formSchema = createLocationSchema.pick({ name: true, description: true });
type Form = z.input<typeof formSchema>;

export default function NewLocation() {
  const orgId = useActiveOrgId();
  const create = useCreateLocation(orgId);
  const { control, handleSubmit } = useForm<Form, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', description: '' },
  });

  const onSubmit = handleSubmit(({ name, description }) =>
    create.mutate({ name, description: description || undefined }, { onSuccess: () => router.back() }),
  );

  return (
    <Screen>
      <TextField control={control} name="name" label="Name" placeholder="e.g. Atrium" />
      <TextField control={control} name="description" label="Description (optional)" multiline />
      {create.error ? <ErrorState message={errorMessage(create.error)} /> : null}
      <Button label="Save location" onPress={onSubmit} loading={create.isPending} />
    </Screen>
  );
}
