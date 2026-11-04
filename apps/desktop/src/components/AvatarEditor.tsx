import { useState } from 'react';
import { Button } from '@heroui/react';
import { Upload } from 'lucide-react';
import type { BotAvatarSpec, Provider } from '@openbot/shared';
import { botAvatarSchema } from '@openbot/shared/schemas';
import { BotAvatar } from './Primitives';
import { avatarFromFile } from '../lib/avatar';

const emojis = ['🤖', '🧑‍💻', '👩‍🎨', '🦊', '🐼', '🐱', '🚀', '💡', '🌟', '🌈', '🍀', '🎯'];

export function AvatarEditor({
  value,
  onChange,
  name,
  provider,
  onBusyChange,
  disabled = false,
}: {
  value: BotAvatarSpec | null;
  onChange: (value: BotAvatarSpec | null) => void;
  name: string;
  provider: Provider;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<'default' | 'emoji' | 'image'>(value?.type ?? 'default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const invalidEmoji = value?.type === 'emoji' && !botAvatarSchema.safeParse(value).success;
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    setLoading(true);
    onBusyChange(true);
    try {
      onChange(await avatarFromFile(file));
      setMode('image');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      onBusyChange(false);
    }
  }
  return (
    <fieldset className="avatar-editor" disabled={disabled || loading}>
      <legend>头像</legend>
      <div className="avatar-editor-head">
        <BotAvatar bot={{ name, provider, avatar: value }} size="large" />
        <div className="avatar-mode-options" role="group" aria-label="头像类型">
          {(['default', 'emoji', 'image'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => {
                setMode(option);
                setError('');
                if (option === 'default') onChange(null);
              }}
            >
              {option === 'default' ? '默认' : option === 'emoji' ? 'Emoji' : '照片'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'emoji' && (
        <div className="avatar-emoji-editor">
          <div className="avatar-emoji-options" role="group" aria-label="常用 emoji">
            {emojis.map((emoji) => (
              <button
                type="button"
                key={emoji}
                aria-label={`使用 ${emoji} 作为头像`}
                aria-pressed={value?.type === 'emoji' && value.value === emoji}
                onClick={() => onChange({ type: 'emoji', value: emoji })}
              >
                {emoji}
              </button>
            ))}
          </div>
          <label className="avatar-emoji-input">
            <span>自定义 emoji</span>
            <input
              value={value?.type === 'emoji' ? value.value : ''}
              maxLength={32}
              aria-invalid={invalidEmoji || undefined}
              placeholder="输入或粘贴一个 emoji"
              onChange={(e) =>
                onChange(
                  e.target.value.trim() ? { type: 'emoji', value: e.target.value.trim() } : null,
                )
              }
            />
          </label>
          {invalidEmoji && <p role="alert">请选择或输入一个 emoji</p>}
        </div>
      )}
      {mode === 'image' && (
        <div className="avatar-photo-editor">
          <label className="avatar-upload-button">
            <Upload size={15} />
            <span>
              {loading ? '正在处理照片…' : value?.type === 'image' ? '更换照片' : '上传照片'}
            </span>
            <input
              type="file"
              aria-label="上传头像照片"
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled || loading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                void upload(file);
              }}
            />
          </label>
          <small>支持 JPG、PNG、WebP，最大 10 MB。照片会居中裁剪为正方形。</small>
        </div>
      )}
      {value && (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          isDisabled={disabled || loading}
          onPress={() => {
            onChange(null);
            setMode('default');
            setError('');
          }}
        >
          恢复默认头像
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
