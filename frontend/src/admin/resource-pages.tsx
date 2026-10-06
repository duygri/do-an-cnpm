import React, { useState } from 'react';
import {
  ArrayInput, BooleanInput, CanAccess, Create, CreateButton, Datagrid, DateInput,
  DeleteButton, Edit, EditButton, FunctionField, List, NumberInput, PasswordInput, ReferenceInput, TopToolbar,
  SelectInput, SimpleForm, SimpleFormIterator, TextField, TextInput,
  useCreate, useDataProvider, useDelete, useGetList, useNotify,
  useRecordContext, useRefresh,
} from 'react-admin';
import type { ProductVariant } from '../types';

const categoryChoices = [{ id: 'active', name: 'Đang bán' }, { id: 'inactive', name: 'Ngừng bán' }];
const statusChoices = [{ id: 'active', name: 'Đang hoạt động' }, { id: 'inactive', name: 'Ngừng hoạt động' }];
const employeeRoleChoices = [{ id: 'admin', name: 'Admin' }, { id: 'manager', name: 'Manager' }];
const employeeStatusChoices = [{ id: 'active', name: 'Đang hoạt động' }, { id: 'inactive', name: 'Đã khóa' }];

export const CategoryList = () => (
  <List title="Danh mục" perPage={25}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="categoryId" label="Mã" />
      <TextField source="name" label="Tên danh mục" />
      <TextField source="description" label="Mô tả" />
      <FunctionField label="Thao tác" render={() => <><EditButton label="Sửa" /><DeleteButton label="Xóa" mutationMode="pessimistic" /></>} />
    </Datagrid>
  </List>
);

const CategoryForm = () => (
  <SimpleForm>
    <TextInput source="name" label="Tên danh mục" validate={requiredField} fullWidth />
    <TextInput source="description" label="Mô tả" multiline fullWidth />
  </SimpleForm>
);

export const CategoryCreate = () => <Create title="Thêm danh mục"><CategoryForm /></Create>;
export const CategoryEdit = () => <Edit title="Sửa danh mục"><CategoryForm /></Edit>;

const requiredField = (value: unknown) => (value ? undefined : 'Vui lòng nhập trường này.');

function VariantManager() {
  const product = useRecordContext<{ id: number; productId?: number }>();
  const productId = product?.productId ?? product?.id;
  const notify = useNotify();
  const refresh = useRefresh();
  const [create, { isPending: isCreating }] = useCreate();
  const [remove, { isPending: isDeleting }] = useDelete();
  const dataProvider = useDataProvider();
  const { data: variants = [], isPending, error } = useGetList<ProductVariant & { id: number }>(
    'productVariants',
    { pagination: { page: 1, perPage: 100 }, sort: { field: 'variantId', order: 'ASC' }, filter: { productId }, meta: { productId } },
    { enabled: Boolean(productId) },
  );
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [price, setPrice] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ size: '', color: '', price: '' });

  if (!productId) return null;
  const busy = isCreating || isDeleting;
  const add = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) return;
    create('productVariants', { data: { productId, size: size || null, color: color || null, price: amount }, meta: { productId } }, {
      onSuccess: () => { notify('Đã thêm biến thể.', { type: 'success' }); setSize(''); setColor(''); setPrice(''); refresh(); },
      onError: (reason) => notify(reason instanceof Error ? reason.message : 'Không thể thêm biến thể.', { type: 'error' }),
    });
  };
  const save = async (variant: ProductVariant & { id: number }) => {
    try {
      await dataProvider.update('productVariants', {
        id: variant.variantId,
        data: { productId, size: draft.size || null, color: draft.color || null, price: Number(draft.price) },
        previousData: variant,
        meta: { productId },
      });
      notify('Đã cập nhật biến thể.', { type: 'success' });
      setEditing(null);
      refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Không thể cập nhật biến thể.', { type: 'error' });
    }
  };
  const deleteVariant = (variant: ProductVariant & { id: number }) => remove('productVariants', {
    id: variant.variantId, previousData: { ...variant, productId }, meta: { productId },
  }, { mutationMode: 'pessimistic', onSuccess: () => { notify('Đã xóa biến thể.', { type: 'success' }); refresh(); } });

  return (
    <section style={{ padding: 24, borderTop: '1px solid #ddd' }} aria-label="Biến thể sản phẩm">
      <h2>Biến thể (size, màu, giá)</h2>
      {isPending && <p role="status">Đang tải biến thể…</p>}
      {error && <p role="alert">Không thể tải biến thể sản phẩm.</p>}
      {!isPending && !error && variants.length === 0 && <p>Sản phẩm chưa có biến thể.</p>}
      {variants.length > 0 && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th>Mã</th><th>Size</th><th>Màu</th><th>Giá</th><th>Thao tác</th></tr></thead>
        <tbody>{variants.map((variant) => <tr key={variant.variantId}>
          <td>{variant.variantId}</td>
          <td>{editing === variant.variantId ? <input aria-label="Size biến thể" value={draft.size} onChange={(event) => setDraft({ ...draft, size: event.target.value })} /> : variant.size || '—'}</td>
          <td>{editing === variant.variantId ? <input aria-label="Màu biến thể" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /> : variant.color || '—'}</td>
          <td>{editing === variant.variantId ? <input aria-label="Giá biến thể" type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /> : `${variant.price} ₫`}</td>
          <td>{editing === variant.variantId ? <><button disabled={busy} onClick={() => void save(variant)}>Lưu</button><button onClick={() => setEditing(null)}>Hủy</button></> : <><button disabled={busy} onClick={() => { setEditing(variant.variantId); setDraft({ size: variant.size ?? '', color: variant.color ?? '', price: variant.price }); }}>Sửa</button><button disabled={busy} onClick={() => deleteVariant(variant)}>Xóa</button></>}</td>
        </tr>)}</tbody>
      </table></div>}
      <form onSubmit={add} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginTop: 16 }}>
        <label>Size<input value={size} onChange={(event) => setSize(event.target.value)} /></label>
        <label>Màu<input value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label>Giá<input required min="0.01" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <button type="submit" disabled={busy}>Thêm biến thể</button>
      </form>
    </section>
  );
}

const ProductForm = () => (
  <>
    <SimpleForm>
      <TextInput source="name" label="Tên sản phẩm" validate={requiredField} fullWidth />
      <TextInput source="description" label="Mô tả" multiline fullWidth />
      <TextInput source="brand" label="Thương hiệu" />
      <ReferenceInput source="categoryId" reference="categories" label="Danh mục">
        <SelectInput optionText="name" validate={requiredField} />
      </ReferenceInput>
      <SelectInput source="status" label="Trạng thái" choices={categoryChoices} />
      <ArrayInput source="images" label="Ảnh sản phẩm">
        <SimpleFormIterator inline>
          <TextInput source="imageUrl" label="URL ảnh" validate={requiredField} />
          <TextInput source="altText" label="Mô tả ảnh" />
          <NumberInput source="sortOrder" label="Thứ tự" min={0} />
          <BooleanInput source="isPrimary" label="Ảnh chính" />
        </SimpleFormIterator>
      </ArrayInput>
    </SimpleForm>
    <VariantManager />
  </>
);

export const ProductList = () => (
  <List title="Sản phẩm" perPage={25}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="productId" label="Mã" />
      <TextField source="name" label="Tên sản phẩm" />
      <TextField source="brand" label="Thương hiệu" />
      <TextField source="categoryId" label="Mã danh mục" />
      <TextField source="status" label="Trạng thái" />
      <FunctionField label="Thao tác" render={() => <><EditButton label="Sửa" /><DeleteButton label="Xóa" mutationMode="pessimistic" /></>} />
    </Datagrid>
  </List>
);

export const ProductCreate = () => <Create title="Thêm sản phẩm"><ProductForm /></Create>;
export const ProductEdit = () => <Edit title="Sửa sản phẩm"><ProductForm /></Edit>;

export const PromotionList = () => (
  <List title="Khuyến mãi" perPage={25}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="promotionId" label="Mã" />
      <TextField source="name" label="Tên chương trình" />
      <TextField source="startDate" label="Bắt đầu" />
      <TextField source="endDate" label="Kết thúc" />
      <TextField source="status" label="Trạng thái" />
      <FunctionField label="Thao tác" render={() => <EditButton label="Sửa" />} />
    </Datagrid>
  </List>
);
const PromotionForm = () => <SimpleForm>
  <TextInput source="name" label="Tên chương trình" validate={requiredField} fullWidth />
  <TextInput source="description" label="Mô tả" multiline fullWidth />
  <DateInput source="startDate" label="Ngày bắt đầu" validate={requiredField} />
  <DateInput source="endDate" label="Ngày kết thúc" validate={requiredField} />
  <SelectInput source="status" label="Trạng thái" choices={statusChoices} />
</SimpleForm>;
export const PromotionCreate = () => <Create title="Thêm khuyến mãi"><PromotionForm /></Create>;
export const PromotionEdit = () => <Edit title="Sửa khuyến mãi"><PromotionForm /></Edit>;

export const VoucherList = () => (
  <List title="Voucher" perPage={25}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="voucherId" label="Mã" />
      <TextField source="promotionId" label="Mã khuyến mãi" />
      <TextField source="code" label="Mã voucher" />
      <TextField source="name" label="Tên voucher" />
      <TextField source="type" label="Kiểu giảm" />
      <TextField source="discountValue" label="Giá trị" />
      <TextField source="quantity" label="Lượt còn lại" />
      <TextField source="status" label="Trạng thái" />
      <FunctionField label="Thao tác" render={() => <EditButton label="Sửa" />} />
    </Datagrid>
  </List>
);
const VoucherForm = ({ editing = false }: { editing?: boolean }) => <SimpleForm>
  <ReferenceInput source="promotionId" reference="promotions" label="Chương trình khuyến mãi"><SelectInput optionText="name" validate={requiredField} disabled={editing} /></ReferenceInput>
  <TextInput source="code" label="Mã voucher" validate={requiredField} disabled={editing} />
  <TextInput source="name" label="Tên voucher" validate={requiredField} />
  <SelectInput source="type" label="Kiểu giảm" choices={[{ id: 'fixed', name: 'Số tiền cố định' }, { id: 'percentage', name: 'Phần trăm' }]} validate={requiredField} />
  <NumberInput source="discountValue" label="Giá trị giảm" min={0.01} step={0.01} validate={requiredField} />
  <DateInput source="startDate" label="Ngày bắt đầu" validate={requiredField} />
  <DateInput source="endDate" label="Ngày kết thúc" validate={requiredField} />
  <NumberInput source="minPrice" label="Đơn tối thiểu" min={0} step={0.01} validate={(value: unknown) => value === undefined || value === null || value === '' ? 'Vui lòng nhập trường này.' : undefined} />
  <NumberInput source="maxDiscount" label="Giảm tối đa (tùy chọn)" min={0.01} step={0.01} />
  <NumberInput source="quantity" label="Tổng lượt sử dụng" min={1} validate={requiredField} />
  <SelectInput source="status" label="Trạng thái" choices={statusChoices} />
</SimpleForm>;
export const VoucherCreate = () => <Create title="Thêm voucher"><VoucherForm /></Create>;
export const VoucherEdit = () => <Edit title="Sửa voucher"><VoucherForm editing /></Edit>;

export const SupplierList = () => (
  <List title="Nhà cung cấp" perPage={25}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="supplierId" label="Mã" />
      <TextField source="name" label="Nhà cung cấp" />
      <TextField source="email" label="Email" />
      <TextField source="address" label="Địa chỉ" />
      <FunctionField label="Thao tác" render={() => <><EditButton label="Sửa" /><DeleteButton label="Xóa" mutationMode="pessimistic" /></>} />
    </Datagrid>
  </List>
);
const SupplierForm = () => <SimpleForm>
  <TextInput source="name" label="Tên nhà cung cấp" validate={requiredField} fullWidth />
  <TextInput source="email" label="Email" type="email" />
  <TextInput source="address" label="Địa chỉ" multiline fullWidth />
</SimpleForm>;
export const SupplierCreate = () => <Create title="Thêm nhà cung cấp"><SupplierForm /></Create>;
export const SupplierEdit = () => <Edit title="Sửa nhà cung cấp"><SupplierForm /></Edit>;

export const EmployeeList = () => (
  <List title="Nhân viên" perPage={25} actions={<TopToolbar><CreateButton label="Thêm nhân viên" /></TopToolbar>}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="employeeId" label="Mã" />
      <TextField source="name" label="Họ tên" />
      <TextField source="email" label="Email" />
      <TextField source="position" label="Chức vụ" />
      <TextField source="role" label="Vai trò" />
      <TextField source="status" label="Trạng thái" />
      <FunctionField label="Thao tác" render={() => <EditButton label="Phân quyền" />} />
    </Datagrid>
  </List>
);
export const EmployeeCreate = () => <Create title="Tạo tài khoản nhân viên"><SimpleForm>
  <TextInput source="name" label="Họ tên" validate={requiredField} />
  <TextInput source="email" label="Email công việc" type="email" validate={requiredField} />
  <PasswordInput source="password" label="Mật khẩu" validate={requiredField} />
  <TextInput source="phone" label="Số điện thoại" />
  <TextInput source="position" label="Chức vụ" validate={requiredField} />
  <SelectInput source="role" label="Vai trò" choices={employeeRoleChoices} defaultValue="manager" validate={requiredField} />
</SimpleForm></Create>;
export const EmployeeEdit = () => <Edit title="Phân quyền nhân viên"><SimpleForm>
  <SelectInput source="role" label="Vai trò" choices={employeeRoleChoices} validate={requiredField} />
  <SelectInput source="status" label="Trạng thái tài khoản" choices={employeeStatusChoices} validate={requiredField} />
</SimpleForm></Edit>;

export function EmployeeAdminMenuResources() {
  return <CanAccess action="list" resource="employees"><CreateButton label="Tạo nhân viên" /></CanAccess>;
}
