import { defaultI18nProvider } from 'react-admin';
import type { I18nProvider } from 'react-admin';

const vietnameseMessages: Record<string, string> = {
  'ra.action.add_filter': 'Thêm bộ lọc',
  'ra.action.back': 'Quay lại',
  'ra.action.cancel': 'Hủy',
  'ra.action.clear_input_value': 'Xóa giá trị',
  'ra.action.clone': 'Sao chép',
  'ra.action.close': 'Đóng',
  'ra.action.confirm': 'Xác nhận',
  'ra.action.create': 'Thêm mới',
  'ra.action.delete': 'Xóa',
  'ra.action.edit': 'Sửa',
  'ra.action.export': 'Xuất',
  'ra.action.list': 'Danh sách',
  'ra.action.refresh': 'Tải lại',
  'ra.action.remove': 'Gỡ',
  'ra.action.save': 'Lưu',
  'ra.action.search': 'Tìm kiếm',
  'ra.action.show': 'Xem',
  'ra.action.sort': 'Sắp xếp',
  'ra.action.undo': 'Hoàn tác',
  'ra.auth.logout': 'Đăng xuất',
  'ra.auth.sign_in': 'Đăng nhập',
  'ra.auth.username': 'Tên đăng nhập',
  'ra.auth.password': 'Mật khẩu',
  'ra.boolean.false': 'Không',
  'ra.boolean.true': 'Có',
  'ra.input.file.upload_several': 'Thả tệp vào đây hoặc nhấn để chọn',
  'ra.navigation.page': 'Trang %{page}',
  'ra.navigation.page_rows_per_page': 'Số dòng mỗi trang:',
  'ra.navigation.page_range_info': '%{offsetBegin}-%{offsetEnd} trên %{total}',
  'ra.navigation.no_results': 'Không có dữ liệu',
  'ra.navigation.no_filtered_results': 'Không tìm thấy kết quả phù hợp',
  'ra.page.create': 'Thêm %{name}',
  'ra.page.edit': 'Sửa %{name} #%{id}',
  'ra.page.list': 'Danh sách %{name}',
  'ra.page.show': 'Chi tiết %{name} #%{id}',
  'ra.message.delete_content': 'Bạn có chắc chắn muốn xóa mục này?',
  'ra.message.delete_title': 'Xóa %{name} #%{id}',
  'ra.message.loading': 'Đang tải…',
  'ra.message.invalid_form': 'Biểu mẫu chưa hợp lệ. Vui lòng kiểm tra lại các trường.',
  'ra.validation.required': 'Vui lòng nhập giá trị này',
  'resources.categories.name': 'Danh mục |||| Danh mục',
  'resources.products.name': 'Sản phẩm |||| Sản phẩm',
  'resources.promotions.name': 'Khuyến mãi |||| Khuyến mãi',
  'resources.vouchers.name': 'Voucher |||| Voucher',
  'resources.suppliers.name': 'Nhà cung cấp |||| Nhà cung cấp',
  'resources.employees.name': 'Nhân viên |||| Nhân viên',
};

function interpolate(template: string, values?: Record<string, unknown>): string {
  const pluralized = template.split('||||');
  const selected = pluralized.length > 1 && Number(values?.smart_count ?? 1) !== 1
    ? pluralized[pluralized.length - 1].trim()
    : pluralized[0].trim();
  return Object.entries(values ?? {}).reduce(
    (text, [key, value]) => text.split(`%{${key}}`).join(String(value)),
    selected,
  );
}

export const vietnameseI18nProvider: I18nProvider = {
  ...defaultI18nProvider,
  translate(key, options) {
    const translated = vietnameseMessages[key];
    return translated === undefined
      ? defaultI18nProvider.translate(key, options)
      : interpolate(translated, options as Record<string, unknown>);
  },
  getLocale: () => 'vi',
};
