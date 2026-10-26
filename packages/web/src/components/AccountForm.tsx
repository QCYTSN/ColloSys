import { useState } from 'react';
import { post, type Auth } from '../api';
import { Button } from './ui/button';
export function AccountForm({ onLogin }: { onLogin: (auth: Auth) => void }) {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="product-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          onLogin(
            await post(`/api/auth/${register ? 'register' : 'login'}`, '', {
              username,
              password,
              ...(register ? { name } : {}),
            }),
          );
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
          setPassword('');
        }
      }}
    >
      <h2>{register ? '创建个人账号' : '使用个人账号登录'}</h2>
      <label>
        用户名
        <input
          required
          minLength={3}
          maxLength={40}
          pattern="[a-z0-9][a-z0-9_.\-]{2,39}"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
        />
      </label>
      {register && (
        <label>
          显示名称
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label>
        密码
        <input
          required
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete={register ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <small>使用至少 12 个字符的密码。账号由本系统保存，当前无需邮箱。</small>
      {error && <p role="alert">{error}</p>}
      <Button disabled={busy}>{busy ? '处理中…' : register ? '注册并登录' : '登录'}</Button>
      <button type="button" className="text-button" onClick={() => setRegister(!register)}>
        {register ? '已有账号，去登录' : '创建新账号'}
      </button>
    </form>
  );
}
