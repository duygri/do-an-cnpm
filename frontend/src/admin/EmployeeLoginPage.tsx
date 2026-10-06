import React, { FormEvent, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Form, Login, PasswordInput, TextInput, useLogin, useNotify,
} from 'react-admin';
import { Button, CardContent, Link as MaterialLink, Typography } from '@mui/material';
import { getPortalUrl } from '../portals/portal-url';

function EmployeeCredentials() {
  const login = useLogin();
  const location = useLocation();
  const notify = useNotify();
  const [pending, setPending] = useState(false);
  const submit = async (values: Record<string, unknown>) => {
    setPending(true);
    try {
      await login({ ...values, returnTo: (location.state as { from?: unknown } | null)?.from });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Đăng nhập không thành công. Vui lòng thử lại.', { type: 'error' });
      setPending(false);
    }
  };
  return (
    <Form onSubmit={submit} mode="onChange" noValidate>
      <CardContent sx={{ width: 340, maxWidth: 'min(84vw, 400px)' }}>
        <Typography variant="overline" color="primary">Cổng quản lý</Typography>
        <Typography variant="h5" component="h1" sx={{ mb: 1 }}>Đăng nhập nhân viên</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Đăng nhập bằng tài khoản nhân viên INDIGO STUDIO.</Typography>
        <TextInput source="email" label="Email công việc" type="email" autoComplete="username" fullWidth autoFocus />
        <PasswordInput source="password" label="Mật khẩu" autoComplete="current-password" fullWidth />
        <Button type="submit" variant="contained" fullWidth disabled={pending} sx={{ mt: 2 }}>
          {pending ? 'Đang xác minh…' : 'Đăng nhập'}
        </Button>
        <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
          Bạn là khách hàng?{' '}
          <MaterialLink href={`${getPortalUrl('user', import.meta.env, window.location.origin)}/login`}>Đăng nhập tại đây</MaterialLink>
        </Typography>
      </CardContent>
    </Form>
  );
}

export const EmployeeLoginPage = () => <Login><EmployeeCredentials /></Login>;
