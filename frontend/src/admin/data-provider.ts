import type { DataProvider } from 'react-admin';
import { api } from '../services/api';
import type {
  Category, EmployeeRecord, ImportRecord, ProductImage, ProductResource, ProductVariant,
  Promotion, Supplier, Voucher,
} from '../types';

type RecordValue = Record<string, unknown> & { id: string | number };
type Meta = Record<string, unknown> | undefined;

const idFields: Record<string, string> = {
  categories: 'categoryId',
  products: 'productId',
  promotions: 'promotionId',
  vouchers: 'voucherId',
  suppliers: 'supplierId',
  imports: 'importId',
  employees: 'employeeId',
  productVariants: 'variantId',
  productImages: 'productImageId',
};

const failUnsupported = (method: string, resource: string): never => {
  throw new Error(`React Admin ${method} is not supported for ${resource}.`);
};

function numericId(id: string | number): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid record ID: ${id}`);
  return value;
}

function withReactAdminId<T extends object>(resource: string, record: T): RecordValue {
  const key = idFields[resource];
  if (!key) throw new Error(`Unknown React Admin resource: ${resource}`);
  const source = record as Record<string, unknown>;
  const id = source[key];
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error(`The ${resource} API record has no ${key}.`);
  }
  return { ...source, id: id as string | number };
}

function withoutKeys(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)));
}

function pickKeys(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys
    .filter((key) => record[key] !== undefined)
    .map((key) => [key, record[key]]));
}

const productImageInputFields = ['imageUrl', 'altText', 'sortOrder', 'isPrimary'] as const;

function productImageInputs(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((image) => image && typeof image === 'object'
    ? pickKeys(image as Record<string, unknown>, productImageInputFields)
    : image);
}

function productInput(input: Record<string, unknown>): Record<string, unknown> {
  const data = pickKeys(input, ['name', 'description', 'brand', 'status', 'categoryId', 'images']);
  if (data.images !== undefined) data.images = productImageInputs(data.images);
  return data;
}

function decimalString(value: unknown, nullable = false): unknown {
  if (nullable && value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function voucherInput(input: Record<string, unknown>, includeCode: boolean): Record<string, unknown> {
  const fields = [
    ...(includeCode ? ['code'] : []), 'name', 'type', 'discountValue', 'startDate', 'endDate',
    'minPrice', 'maxDiscount', 'quantity', 'status',
  ];
  const data = pickKeys(input, fields);
  for (const field of ['discountValue', 'minPrice', 'maxDiscount']) {
    if (data[field] !== undefined) data[field] = decimalString(data[field], field === 'maxDiscount');
  }
  return data;
}

function parentId(data: Record<string, unknown>, meta: Meta, field: 'productId' | 'promotionId'): number {
  const value = data[field] ?? meta?.[field];
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${field} is required for this nested resource.`);
  }
  return numericId(value);
}

async function voucherPromotionId(voucherId: number, data: Record<string, unknown>, meta?: Meta): Promise<number> {
  const parent = data.promotionId ?? meta?.promotionId;
  if (typeof parent === 'string' || typeof parent === 'number') return numericId(parent);

  const promotions = await api.getPromotions();
  for (const promotion of promotions) {
    const vouchers = await api.getVouchers(promotion.promotionId);
    if (vouchers.some((voucher) => voucher.voucherId === voucherId)) return promotion.promotionId;
  }
  throw new Error(`Voucher ${voucherId} was not found.`);
}

async function loadArray(resource: string, filter: Record<string, unknown>, meta?: Meta): Promise<unknown[]> {
  switch (resource) {
    case 'categories': return api.getManagedCategories();
    case 'products': return api.getCatalogProducts();
    case 'promotions': return api.getPromotions();
    case 'suppliers': return api.getSuppliers();
    case 'imports': return api.getImports();
    case 'vouchers': {
      const promotionId = filter.promotionId ?? meta?.promotionId;
      if (typeof promotionId === 'number' || typeof promotionId === 'string') return api.getVouchers(numericId(promotionId));
      const promotions = await api.getPromotions();
      const vouchers = await Promise.all(promotions.map((promotion) => api.getVouchers(promotion.promotionId)));
      return vouchers.flat();
    }
    case 'productVariants': {
      const productId = filter.productId ?? meta?.productId;
      if (typeof productId === 'number' || typeof productId === 'string') return api.getProductVariants(numericId(productId));
      const products = await api.getCatalogProducts();
      const variants = await Promise.all(products.map((product) => api.getProductVariants(product.productId)));
      return variants.flat();
    }
    case 'productImages': {
      const productId = parentId(filter, meta, 'productId');
      const product = await api.getCatalogProduct(productId);
      return product.images ?? [];
    }
    default: return failUnsupported('getList', resource);
  }
}

async function getRecord(resource: string, id: string | number, meta?: Meta): Promise<unknown> {
  const key = idFields[resource];
  if (!key) return failUnsupported('getOne', resource);
  const recordId = numericId(id);
  switch (resource) {
    case 'categories': return api.getCategory(recordId);
    case 'products': return api.getCatalogProduct(recordId);
    case 'promotions': return api.getPromotion(recordId);
    case 'suppliers': return api.getSupplier(recordId);
    case 'imports': return api.getImport(recordId);
    case 'employees': {
      let page = 1;
      let total = Number.POSITIVE_INFINITY;
      while ((page - 1) * 100 < total) {
        const result = await api.getEmployees({ page, limit: 100 });
        const found = result.items.find((employee) => employee.employeeId === recordId);
        if (found) return found;
        total = result.total;
        page += 1;
      }
      throw new Error(`Employee ${recordId} was not found.`);
    }
    case 'vouchers': {
      const promotionId = meta?.promotionId;
      if (typeof promotionId === 'number' || typeof promotionId === 'string') return api.getVoucher(numericId(promotionId), recordId);
      const promotions = await api.getPromotions();
      for (const promotion of promotions) {
        const voucher = (await api.getVouchers(promotion.promotionId)).find((item) => item.voucherId === recordId);
        if (voucher) return voucher;
      }
      throw new Error(`Voucher ${recordId} was not found.`);
    }
    case 'productVariants': {
      const productId = meta?.productId;
      if (typeof productId === 'number' || typeof productId === 'string') {
        const variant = (await api.getProductVariants(numericId(productId))).find((item) => item.variantId === recordId);
        if (variant) return variant;
      } else {
        const products = await api.getCatalogProducts();
        for (const product of products) {
          const variant = (await api.getProductVariants(product.productId)).find((item) => item.variantId === recordId);
          if (variant) return variant;
        }
      }
      throw new Error(`Product variant ${recordId} was not found.`);
    }
    case 'productImages': {
      const parent = parentId({}, meta, 'productId');
      const image = (await api.getCatalogProduct(parent)).images?.find((item) => item.productImageId === recordId);
      if (!image) throw new Error(`Product image ${recordId} was not found.`);
      return image;
    }
    default: return failUnsupported('getOne', resource);
  }
}

function matchesFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([field, expected]) => {
    if (expected === undefined || expected === null || expected === '') return true;
    const value = record[field];
    if (typeof expected === 'string' && typeof value === 'string') {
      return value.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
    }
    return String(value) === String(expected);
  });
}

type ListInput = {
  pagination?: { page?: number; perPage?: number };
  sort?: { field?: string; order?: 'ASC' | 'DESC' };
  filter?: Record<string, unknown>;
};

function pageRecords(records: RecordValue[], params: ListInput) {
  const filtered = records.filter((record) => matchesFilter(record, params.filter ?? {}));
  const field = params.sort?.field;
  const direction = params.sort?.order === 'DESC' ? -1 : 1;
  const sorted = field ? [...filtered].sort((left, right) => {
    const a = left[field];
    const b = right[field];
    return String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true }) * direction;
  }) : filtered;
  const page = params.pagination?.page ?? 1;
  const perPage = params.pagination?.perPage ?? 25;
  const start = Math.max(0, (page - 1) * perPage);
  return { data: sorted.slice(start, start + perPage), total: sorted.length };
}

async function createRecord(resource: string, input: Record<string, unknown>, meta?: Meta): Promise<unknown> {
  const data = withoutKeys(input, 'id');
  switch (resource) {
    case 'categories': return api.createCategory(pickKeys(data, ['name', 'description']) as unknown as Parameters<typeof api.createCategory>[0]);
    case 'products': return api.createProduct(productInput(data) as unknown as Parameters<typeof api.createProduct>[0]);
    case 'promotions': return api.createPromotion(pickKeys(data, ['name', 'description', 'startDate', 'endDate', 'status']) as unknown as Parameters<typeof api.createPromotion>[0]);
    case 'suppliers': return api.createSupplier(pickKeys(data, ['name', 'address', 'email']) as unknown as Parameters<typeof api.createSupplier>[0]);
    case 'employees': return api.createEmployee(pickKeys(data, ['name', 'email', 'password', 'phone', 'position', 'role']) as unknown as Parameters<typeof api.createEmployee>[0]);
    case 'vouchers': return api.createVoucher(parentId(data, meta, 'promotionId'), voucherInput(data, true) as unknown as Parameters<typeof api.createVoucher>[1]);
    case 'productVariants': return api.createProductVariant(parentId(data, meta, 'productId'), pickKeys(data, ['size', 'color', 'price']) as unknown as Parameters<typeof api.createProductVariant>[1]);
    case 'productImages': {
      const productId = parentId(data, meta, 'productId');
      const product = await api.getCatalogProduct(productId);
      const images = [...(product.images ?? []), pickKeys(data, productImageInputFields) as unknown as Omit<ProductImage, 'productImageId'>];
      const updated = await api.updateProduct(productId, { images: images.map(({ imageUrl, altText, sortOrder, isPrimary }) => ({ imageUrl, altText, sortOrder, isPrimary })) });
      const created = updated.images?.find((image) => image.imageUrl === data.imageUrl && image.altText === (data.altText ?? null));
      return created ?? updated.images?.at(-1) ?? failUnsupported('create', resource);
    }
    default: return failUnsupported('create', resource);
  }
}

async function updateRecord(resource: string, id: string | number, input: Record<string, unknown>, meta?: Meta): Promise<unknown> {
  const recordId = numericId(id);
  const data = withoutKeys(input, 'id');
  switch (resource) {
    case 'categories': return api.updateCategory(recordId, pickKeys(data, ['name', 'description']) as unknown as Parameters<typeof api.updateCategory>[1]);
    case 'products': return api.updateProduct(recordId, productInput(data) as unknown as Parameters<typeof api.updateProduct>[1]);
    case 'promotions': return api.updatePromotion(recordId, pickKeys(data, ['name', 'description', 'startDate', 'endDate', 'status']) as unknown as Parameters<typeof api.updatePromotion>[1]);
    case 'suppliers': return api.updateSupplier(recordId, pickKeys(data, ['name', 'address', 'email']) as unknown as Parameters<typeof api.updateSupplier>[1]);
    case 'employees': return api.updateEmployeeAccess(recordId, pickKeys(data, ['role', 'status']) as unknown as Parameters<typeof api.updateEmployeeAccess>[1]);
    case 'vouchers': return api.updateVoucher(await voucherPromotionId(recordId, input, meta), recordId, voucherInput(data, false) as unknown as Parameters<typeof api.updateVoucher>[2]);
    case 'productVariants': return api.updateProductVariant(parentId({}, meta ?? input, 'productId'), recordId, pickKeys(data, ['size', 'color', 'price']) as unknown as Parameters<typeof api.updateProductVariant>[2]);
    case 'productImages': {
      const productId = parentId({}, meta ?? input, 'productId');
      const product = await api.getCatalogProduct(productId);
      const imageInput = pickKeys(data, productImageInputFields);
      const images = (product.images ?? []).map((image) => image.productImageId === recordId ? { ...image, ...imageInput } : image);
      const updated = await api.updateProduct(productId, { images: images.map(({ imageUrl, altText, sortOrder, isPrimary }) => ({ imageUrl, altText, sortOrder, isPrimary })) });
      const saved = updated.images?.find((image) => image.productImageId === recordId);
      return saved ?? failUnsupported('update', resource);
    }
    default: return failUnsupported('update', resource);
  }
}

async function deleteRecord(resource: string, id: string | number, previousData: Record<string, unknown>, meta?: Meta): Promise<unknown> {
  const recordId = numericId(id);
  switch (resource) {
    case 'categories': await api.deleteCategory(recordId); return previousData;
    case 'products': await api.deleteProduct(recordId); return previousData;
    case 'suppliers': await api.deleteSupplier(recordId); return previousData;
    case 'productVariants': await api.deleteProductVariant(parentId(previousData, meta, 'productId'), recordId); return previousData;
    case 'productImages': {
      const productId = parentId(previousData, meta, 'productId');
      const product = await api.getCatalogProduct(productId);
      const images = (product.images ?? []).filter((image) => image.productImageId !== recordId);
      await api.updateProduct(productId, { images: images.map(({ imageUrl, altText, sortOrder, isPrimary }) => ({ imageUrl, altText, sortOrder, isPrimary })) });
      return previousData;
    }
    default: return failUnsupported('delete', resource);
  }
}

const employeeDataProviderImplementation = {
  async getList(resource: string, params: any) {
    if (resource === 'employees') {
      const result = await api.getEmployees({ page: params.pagination.page, limit: params.pagination.perPage });
      const data = result.items.map((record) => withReactAdminId(resource, record));
      return { data, total: result.total };
    }
    const records = (await loadArray(resource, params.filter ?? {}, params.meta))
      .map((record) => withReactAdminId(resource, record as object));
    return pageRecords(records, params);
  },

  async getOne(resource: string, params: any) {
    const record = await getRecord(resource, params.id, params.meta);
    return { data: withReactAdminId(resource, record as object) };
  },

  async getMany(resource: string, params: any) {
    const data = await Promise.all((params.ids as Array<string | number>).map(async (id: string | number) => {
      const record = await getRecord(resource, id);
      return withReactAdminId(resource, record as object);
    }));
    return { data };
  },

  async getManyReference(resource: string, params: any) {
    const records = (await loadArray(resource, { ...params.filter, [params.target]: params.id }, params.meta))
      .map((record) => withReactAdminId(resource, record as object));
    return pageRecords(records, params);
  },

  async create(resource: string, params: any) {
    const record = await createRecord(resource, params.data as Record<string, unknown>, params.meta);
    return { data: withReactAdminId(resource, record as object) };
  },

  async update(resource: string, params: any) {
    const record = await updateRecord(resource, params.id, params.data as Record<string, unknown>, params.meta);
    return { data: withReactAdminId(resource, record as object) };
  },

  async updateMany(resource: string, params: any) {
    const data = await Promise.all((params.ids as Array<string | number>).map(async (id: string | number) => {
      const record = await updateRecord(resource, id, params.data as Record<string, unknown>);
      return withReactAdminId(resource, record as object).id;
    }));
    return { data };
  },

  async delete(resource: string, params: any) {
    const record = await deleteRecord(resource, params.id, params.previousData as Record<string, unknown> ?? {}, params.meta);
    return { data: withReactAdminId(resource, record as object) };
  },

  async deleteMany(resource: string, params: any) {
    await Promise.all((params.ids as Array<string | number>).map((id: string | number) => deleteRecord(resource, id, {}, params.meta)));
    return { data: params.ids };
  },
};

// React Admin's resource record generics cannot express the API's different IDs.
// This boundary is intentionally cast after each resource has normalized its ID.
export const employeeDataProvider = employeeDataProviderImplementation as unknown as DataProvider;
