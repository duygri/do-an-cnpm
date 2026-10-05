import React, { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

export const CustomerRegisterPage: React.FC = () => {
  const { customerLogin } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.customerRegister({
        name: name.trim(),
        email: email.trim(),
        password,
        dateOfBirth: dateOfBirth || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        gender: gender || undefined,
      });
      customerLogin(response.access_token, response.customer);
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Đăng ký không thành công. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-gutter py-12 sm:py-16">
      <div className="max-w-2xl mx-auto rounded-2xl border border-border-neutral bg-surface p-6 shadow-sm sm:p-8">
        <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">Tài khoản INDIGO</p>
        <h1 className="mt-2 font-headline-md text-headline-md font-bold text-on-surface">Tạo tài khoản</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">Các thông tin ngày sinh, số điện thoại và địa chỉ là tùy chọn.</p>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="font-label-md text-label-md font-medium text-on-surface">Họ và tên</span>
            <input
              type="text"
              autoComplete="name"
              maxLength={120}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-body-md text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="font-label-md text-label-md font-medium text-on-surface">Email</span>
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-body-md text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="font-label-md text-label-md font-medium text-on-surface">Mật khẩu</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-body-md text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="mt-1 block font-body-sm text-body-sm text-outline">Mật khẩu cần có từ 12 đến 128 ký tự.</span>
          </label>
          <label className="block">
            <span className="font-label-md text-label-md font-medium text-on-surface">Ngày sinh <span className="font-normal text-outline">(tùy chọn)</span></span>
            <input
              type="date"
              autoComplete="bday"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-body-md text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="font-label-md text-label-md font-medium text-on-surface">Số điện thoại <span className="font-normal text-outline">(tùy chọn)</span></span>
            <input
              type="tel"
              autoComplete="tel"
              maxLength={30}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-body-md text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="font-label-md text-label-md font-medium text-on-surface">Giới tính <span className="font-normal text-outline">(tùy chọn)</span></span>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-body-md text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Chọn giới tính</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
            </select>
          </label>
          <label className="block">
            <span className="font-label-md text-label-md font-medium text-on-surface">Địa chỉ <span className="font-normal text-outline">(tùy chọn)</span></span>
            <input
              type="text"
              autoComplete="street-address"
              maxLength={2000}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-body-md text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-lg bg-primary px-5 py-3 font-label-md text-label-md font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
          >
            {submitting ? 'Đang tạo tài khoản...' : 'Đăng ký'}
          </button>
        </form>

        <p className="mt-6 text-center font-body-sm text-body-sm text-on-surface-variant">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">Đăng nhập</Link>
        </p>
      </div>
    </section>
  );
};
