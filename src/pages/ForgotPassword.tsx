import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Field, Logo, inputClass } from '../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.forgotPassword(email);
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <div className="mx-auto mt-6 grid size-14 place-items-center rounded-full bg-brand/10 text-brand">
            <MailCheck className="size-7" />
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight">請查收你的信箱</h1>
          <p className="mt-2 text-ink-soft">
            如果 <span className="font-bold text-ink">{email}</span> 有註冊帳號，重設密碼的連結已經寄過去了（1 小時內有效）。
          </p>
          <Link to="/login" className="mt-6 block text-sm font-bold text-ink-soft hover:text-ink">
            返回登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-center text-2xl font-black tracking-tight">忘記密碼</h1>
        <p className="mt-2 text-center text-ink-soft">輸入註冊時用的 Email，我們會寄一封重設密碼的信給你。</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? '寄送中…' : '寄送重設密碼信'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-soft">
          想起密碼了？
          <Link to="/login" className="ml-1 font-bold text-brand hover:underline">
            返回登入
          </Link>
        </p>
      </div>
    </div>
  );
}
