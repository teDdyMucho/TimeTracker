import { Text, TextInput, View } from 'react-native';
import { Chip } from '@/components/ui';
import type { OvertimeApprover } from '@/lib/types';

const INK = '#18181B';
const MUTED = '#71717A';
const LINE = '#E4E4E7';

/**
 * TV3: the worker says why they are working overtime and picks who should
 * approve it (Robbie, Mitch, Chris or Terry). Used on Home both for a request
 * raised during the day and for the request made at clock-out.
 */
export default function OvertimeRequestForm({
  approvers,
  approverId,
  onApprover,
  reason,
  onReason,
  disabled,
}: {
  approvers: OvertimeApprover[];
  approverId: string | null;
  onApprover: (id: string) => void;
  reason: string;
  onReason: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <View>
      <TextInput
        value={reason}
        onChangeText={onReason}
        placeholder="Reason for overtime (required)"
        placeholderTextColor={MUTED}
        multiline
        editable={!disabled}
        className="rounded-xl px-3 py-2 mt-3 text-ink"
        style={{ borderWidth: 1, borderColor: LINE, color: INK, minHeight: 44 }}
      />
      <Text className="text-muted text-xs mt-3 mb-1">Who should approve it?</Text>
      {approvers.length === 0 ? (
        <Text className="text-muted text-xs">
          Approver list not available right now — the request will go to all approvers.
        </Text>
      ) : (
        <View className="flex-row flex-wrap">
          {approvers.map((a) => (
            <Chip key={a.id} label={a.name} selected={approverId === a.id} onPress={() => !disabled && onApprover(a.id)} />
          ))}
        </View>
      )}
    </View>
  );
}
