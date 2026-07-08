import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/store/auth';
import {
  fetchMessages, sendMessage, markMessagesRead, type ChatMessage,
} from '@/lib/queries';

const INK = '#1C1A16';
const LINE = '#E4E4E7';
const MUTED = '#71717A';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function Messages() {
  const profile = useAuth((s) => s.profile);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () => scrollRef.current?.scrollToEnd({ animated: true });

  // Track the keyboard height so we can lift the composer above it (works on
  // both iOS and Android regardless of native layout mode).
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates.height);
      setTimeout(scrollToEnd, 50);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const rows = await fetchMessages(profile.id);
      setMessages(rows);
      await markMessagesRead(profile.id);
    } catch (e) {
      console.warn('[messages] load', e);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // Poll every 8s so new admin messages appear without leaving the screen.
  useEffect(() => {
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !profile) return;
    setSending(true);
    // optimistic
    const optimistic: ChatMessage = {
      id: `temp-${messages.length}`, body, sender_role: 'employee', read: true,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setText('');
    try {
      await sendMessage(profile.id, body);
      await load();
    } catch (e) {
      console.warn('[messages] send', e);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  // Lift the whole chat in JS by the keyboard height so the composer stays
  // visible above the keyboard (works in Expo Go on both iOS and Android).
  // iOS keyboard height already includes the home-indicator inset, so subtract it.
  const liftPad = kbHeight > 0
    ? kbHeight - (Platform.OS === 'ios' ? insets.bottom : 0)
    : 0;

  return (
    <View className="flex-1 bg-paper" style={{ paddingBottom: Math.max(liftPad, 0) }}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="p-4 gap-3"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToEnd}
      >
        {messages.length === 0 ? (
          <View className="items-center py-16">
            <Ionicons name="chatbubbles-outline" size={40} color={MUTED} />
            <Text className="text-muted mt-3 text-center">No messages yet.{'\n'}Send a message to your admin below.</Text>
          </View>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === 'employee';
            return (
              <View key={m.id} className={`max-w-[80%] ${mine ? 'self-end' : 'self-start'}`}>
                {!mine && <Text className="text-[10px] mb-1 ml-1" style={{ color: MUTED }}>Admin</Text>}
                <View
                  className="rounded-2xl px-4 py-2.5"
                  style={mine
                    ? { backgroundColor: INK }
                    : { backgroundColor: '#fff', borderWidth: 1, borderColor: LINE }}
                >
                  <Text style={{ color: mine ? '#fff' : INK, fontSize: 15 }}>{m.body}</Text>
                </View>
                <Text className={`text-[10px] mt-1 ${mine ? 'self-end mr-1' : 'ml-1'}`} style={{ color: '#A1A1AA' }}>
                  {timeLabel(m.created_at)}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Composer — sits above the keyboard, padded for the home indicator */}
      <View
        className="flex-row items-end gap-2 px-4 pt-3 border-t bg-paper"
        style={{ borderColor: LINE, paddingBottom: kbHeight > 0 ? 10 : Math.max(insets.bottom, 12) }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message admin…"
          placeholderTextColor={MUTED}
          multiline
          className="flex-1 bg-white rounded-2xl px-4 py-3 text-ink text-base max-h-28"
          style={{ borderWidth: 1, borderColor: LINE }}
        />
        <Pressable
          onPress={send}
          disabled={sending || !text.trim()}
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: INK, opacity: sending || !text.trim() ? 0.5 : 1 }}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
