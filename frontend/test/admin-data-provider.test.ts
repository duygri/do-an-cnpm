import { beforeEach, describe, expect, it, vi } from 'vitest';
import { employeeDataProvider } from '../src/admin/data-provider';
import { api } from '../src/services/api';

const apiMock = vi.hoisted(() => ({
  getManagedCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  updateEmployeeAccess: vi.fn(),
  getEmployees: vi.fn(),
  getPromotions: vi.fn(),
  getVouchers: vi.fn(),
  createVoucher: vi.fn(),
  updateVoucher: vi.fn(),
  getCatalogProducts: vi.fn(),
  getCatalogProduct: vi.fn(),
  updateProduct: vi.fn(),
  getProductVariants: vi.fn(),
  createProductVariant: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ api: apiMock }));

beforeEach(() => vi.clearAllMocks());

describe('employee React Admin data provider', () => {
  it('maps API IDs and applies client pagination, filters, sorting, and total counts', async () => {
    vi.mocked(api.getManagedCategories).mockResolvedValue([
      { categoryId: 3, name: 'Áo', description: null },
      { categoryId: 1, name: 'Quần', description: null },
      { categoryId: 2, name: 'Áo khoác', description: null },
    ]);

    await expect(employeeDataProvider.getList('categories', {
      pagination: { page: 1, perPage: 2 },
      sort: { field: 'name', order: 'ASC' },
      filter: { name: 'áo' },
    })).resolves.toEqual({
      data: [
        { id: 3, categoryId: 3, name: 'Áo', description: null },
        { id: 2, categoryId: 2, name: 'Áo khoác', description: null },
      ],
      total: 2,
    });
  });

  it('uses backend pagination for the employee list', async () => {
    vi.mocked(api.getEmployees).mockResolvedValue({
      items: [{ employeeId: 8, name: 'Manager', email: 'manager@example.test', position: 'Quản lý', role: 'manager', status: 'active', phone: null }],
      page: 2, limit: 10, total: 11,
    });

    await expect(employeeDataProvider.getList('employees', {
      pagination: { page: 2, perPage: 10 },
      sort: { field: 'name', order: 'ASC' },
      filter: {},
    })).resolves.toEqual({
      data: [{ id: 8, employeeId: 8, name: 'Manager', email: 'manager@example.test', position: 'Quản lý', role: 'manager', status: 'active', phone: null }],
      total: 11,
    });
    expect(api.getEmployees).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('maps category create, update, and delete to existing API methods', async () => {
    const created = { categoryId: 4, name: 'Áo', description: null };
    const updated = { categoryId: 4, name: 'Áo mới', description: null };
    vi.mocked(api.createCategory).mockResolvedValue(created);
    vi.mocked(api.updateCategory).mockResolvedValue(updated);
    vi.mocked(api.deleteCategory).mockResolvedValue(undefined);

    await expect(employeeDataProvider.create('categories', { data: { id: 0, name: 'Áo', description: null } }))
      .resolves.toEqual({ data: { ...created, id: 4 } });
    expect(api.createCategory).toHaveBeenCalledWith({ name: 'Áo', description: null });

    await expect(employeeDataProvider.update('categories', {
      id: 4, data: { id: 4, categoryId: 4, name: 'Áo mới' }, previousData: { ...created, id: 4 },
    })).resolves.toEqual({ data: { ...updated, id: 4 } });
    expect(api.updateCategory).toHaveBeenCalledWith(4, { name: 'Áo mới' });

    await expect(employeeDataProvider.delete('categories', { id: 4, previousData: { ...updated, id: 4 } }))
      .resolves.toEqual({ data: { ...updated, id: 4 } });
    expect(api.deleteCategory).toHaveBeenCalledWith(4);
  });

  it('loads nested voucher lists with the promotion ID and normalizes record IDs', async () => {
    vi.mocked(api.getVouchers).mockResolvedValue([
      { voucherId: 12, promotionId: 5, code: 'SUMMER', name: 'Summer', type: 'fixed', discountValue: '20.00', startDate: '2026-01-01', endDate: '2026-12-31', minPrice: '0.00', maxDiscount: null, quantity: 5, status: 'active' },
    ]);

    await expect(employeeDataProvider.getList('vouchers', {
      pagination: { page: 1, perPage: 25 }, sort: { field: 'voucherId', order: 'ASC' },
      filter: { promotionId: 5 }, meta: { promotionId: 5 },
    })).resolves.toMatchObject({ data: [{ id: 12, voucherId: 12, promotionId: 5 }], total: 1 });
    expect(api.getVouchers).toHaveBeenCalledWith(5);
  });

  it('creates nested vouchers and variants through their existing parent routes', async () => {
    vi.mocked(api.createVoucher).mockResolvedValue({
      voucherId: 13, promotionId: 5, code: 'NEW', name: 'New', type: 'fixed', discountValue: '10.00', startDate: '2026-01-01', endDate: '2026-12-31', minPrice: '0.00', maxDiscount: null, quantity: 3, status: 'active',
    });
    vi.mocked(api.createProductVariant).mockResolvedValue({ variantId: 22, productId: 7, size: 'M', color: 'Blue', price: '250.00' });

    await expect(employeeDataProvider.create('vouchers', {
      data: { promotionId: 5, code: 'NEW', name: 'New', type: 'fixed', discountValue: 10, startDate: '2026-01-01', endDate: '2026-12-31', minPrice: 0, maxDiscount: 20, quantity: 3 },
    })).resolves.toMatchObject({ data: { id: 13, voucherId: 13 } });
    expect(api.createVoucher).toHaveBeenCalledWith(5, expect.objectContaining({ code: 'NEW', discountValue: '10', minPrice: '0', maxDiscount: '20' }));

    await expect(employeeDataProvider.create('productVariants', {
      data: { productId: 7, size: 'M', color: 'Blue', price: 250 }, meta: { productId: 7 },
    })).resolves.toEqual({ data: { id: 22, variantId: 22, productId: 7, size: 'M', color: 'Blue', price: '250.00' } });
    expect(api.createProductVariant).toHaveBeenCalledWith(7, { size: 'M', color: 'Blue', price: 250 });
  });

  it('updates products with valid image inputs and preserves category changes', async () => {
    vi.mocked(api.updateProduct).mockResolvedValue({
      productId: 7, name: 'Áo thun', description: 'Mô tả', brand: 'Indigo', status: 'active', categoryId: 3,
      images: [{ productImageId: 31, productId: 7, imageUrl: 'https://img.example.test/shirt.png', altText: 'Áo xanh', sortOrder: 0, isPrimary: true }],
    });
    const formRecord = {
      id: 7, productId: 7, name: 'Áo thun', description: 'Mô tả', brand: 'Indigo', status: 'active', categoryId: 3,
      category: { categoryId: 3, name: 'Áo' }, variants: [{ variantId: 22, size: 'M', color: 'Blue', price: '250.00', productId: 7 }],
      images: [{ productImageId: 31, productId: 7, imageUrl: 'https://img.example.test/shirt.png', altText: 'Áo xanh', sortOrder: 0, isPrimary: true }],
    };

    await employeeDataProvider.update('products', { id: 7, data: formRecord, previousData: formRecord });

    expect(api.updateProduct).toHaveBeenCalledWith(7, {
      name: 'Áo thun', description: 'Mô tả', brand: 'Indigo', status: 'active', categoryId: 3,
      images: [{ imageUrl: 'https://img.example.test/shirt.png', altText: 'Áo xanh', sortOrder: 0, isPrimary: true }],
    });
  });

  it('updates employees with only the role and status fields accepted by the API', async () => {
    const employeeRecord = {
      id: 8, employeeId: 8, name: 'Manager', email: 'manager@example.test', phone: null, position: 'Quản lý', role: 'manager', status: 'active',
    };
    vi.mocked(api.updateEmployeeAccess).mockResolvedValue({ ...employeeRecord, role: 'admin', status: 'inactive' });

    await employeeDataProvider.update('employees', {
      id: 8, data: { ...employeeRecord, role: 'admin', status: 'inactive' }, previousData: employeeRecord,
    });

    expect(api.updateEmployeeAccess).toHaveBeenCalledWith(8, { role: 'admin', status: 'inactive' });
  });

  it('updates vouchers without immutable codes and serializes decimal inputs as strings', async () => {
    vi.mocked(api.updateVoucher).mockResolvedValue({
      voucherId: 13, promotionId: 5, code: 'NEW', name: 'Newer', type: 'fixed', discountValue: '15.5', startDate: '2026-01-01', endDate: '2026-12-31', minPrice: '100', maxDiscount: '25', quantity: 3, status: 'active',
    });
    const formRecord = {
      id: 13, voucherId: 13, promotionId: 5, code: 'NEW', name: 'Newer', type: 'fixed', discountValue: 15.5,
      startDate: '2026-01-01', endDate: '2026-12-31', minPrice: 100, maxDiscount: 25, quantity: 3, status: 'active',
    };

    await employeeDataProvider.update('vouchers', { id: 13, data: formRecord, previousData: formRecord });

    expect(api.updateVoucher).toHaveBeenCalledWith(5, 13, {
      name: 'Newer', type: 'fixed', discountValue: '15.5', startDate: '2026-01-01', endDate: '2026-12-31',
      minPrice: '100', maxDiscount: '25', quantity: 3, status: 'active',
    });
  });

  it('resolves a voucher parent when immutable promotion fields are omitted from edit data', async () => {
    vi.mocked(api.getPromotions).mockResolvedValue([{
      promotionId: 5, name: 'Khuyến mãi', description: null, startDate: '2026-01-01', endDate: '2026-12-31', status: 'active',
    }]);
    vi.mocked(api.getVouchers).mockResolvedValue([{
      voucherId: 13, promotionId: 5, code: 'NEW', name: 'New', type: 'fixed', discountValue: '15.50',
      startDate: '2026-01-01', endDate: '2026-12-31', minPrice: '100.00', maxDiscount: null, quantity: 3, status: 'active',
    }]);
    vi.mocked(api.updateVoucher).mockResolvedValue({
      voucherId: 13, promotionId: 5, code: 'NEW', name: 'Updated', type: 'fixed', discountValue: '15.50',
      startDate: '2026-01-01', endDate: '2026-12-31', minPrice: '100.00', maxDiscount: null, quantity: 3, status: 'active',
    });

    await employeeDataProvider.update('vouchers', { id: 13, data: { id: 13, name: 'Updated' } });

    expect(api.updateVoucher).toHaveBeenCalledWith(5, 13, { name: 'Updated' });
  });

  it('creates a product image by saving the image array through its parent product', async () => {
    vi.mocked(api.getCatalogProduct).mockResolvedValue({
      productId: 7, name: 'Áo thun', description: null, brand: null, status: 'active', categoryId: 2,
      images: [],
    });
    vi.mocked(api.updateProduct).mockResolvedValue({
      productId: 7, name: 'Áo thun', description: null, brand: null, status: 'active', categoryId: 2,
      images: [{ productImageId: 31, imageUrl: 'https://img.example.test/shirt.png', altText: 'Áo xanh', sortOrder: 0, isPrimary: true }],
    });

    await expect(employeeDataProvider.create('productImages', {
      data: { productId: 7, imageUrl: 'https://img.example.test/shirt.png', altText: 'Áo xanh', sortOrder: 0, isPrimary: true },
      meta: { productId: 7 },
    })).resolves.toEqual({ data: {
      id: 31, productImageId: 31, imageUrl: 'https://img.example.test/shirt.png', altText: 'Áo xanh', sortOrder: 0, isPrimary: true,
    } });
    expect(api.getCatalogProduct).toHaveBeenCalledWith(7);
    expect(api.updateProduct).toHaveBeenCalledWith(7, { images: [{ imageUrl: 'https://img.example.test/shirt.png', altText: 'Áo xanh', sortOrder: 0, isPrimary: true }] });
  });

  it('preserves API failures for React Admin error handling', async () => {
    const failure = new Error('API unavailable');
    vi.mocked(api.getManagedCategories).mockRejectedValue(failure);

    await expect(employeeDataProvider.getList('categories', {
      pagination: { page: 1, perPage: 25 }, sort: { field: 'categoryId', order: 'ASC' }, filter: {},
    })).rejects.toBe(failure);
  });
});
