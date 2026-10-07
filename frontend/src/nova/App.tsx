import {
  BrowserRouter,
  Route,
  Routes,
  Navigate,
  useParams,
} from "react-router-dom";
import Layout from "./Layout";
import { ShopProvider } from "./ShopContext";
import Catalog from "./pages/Catalog";
import Product from "./pages/Product";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Auth, { Protected } from "./pages/Auth";
import { Profile, Orders, OrderDetail } from "./pages/Account";

function LegacyProduct() {
  const { id } = useParams();
  return <Navigate to={"/products/" + id} replace />;
}
function LegacyOrder() {
  const { orderId } = useParams();
  return <Navigate to={"/account/orders/" + orderId} replace />;
}
export default function App() {
  return (
    <BrowserRouter>
      <ShopProvider>
        <Layout>
          <Routes>
            <Route path="/product/:id" element={<LegacyProduct />} />
            <Route
              path="/orders"
              element={<Navigate to="/account/orders" replace />}
            />
            <Route path="/orders/:orderId" element={<LegacyOrder />} />
            <Route path="/" element={<Catalog />} />
            <Route path="/products/:id" element={<Product />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/register" element={<Auth register />} />
            <Route
              path="/checkout"
              element={
                <Protected>
                  <Checkout />
                </Protected>
              }
            />
            <Route
              path="/account/profile"
              element={
                <Protected>
                  <Profile />
                </Protected>
              }
            />
            <Route
              path="/account/orders"
              element={
                <Protected>
                  <Orders />
                </Protected>
              }
            />
            <Route
              path="/account/orders/:orderId"
              element={
                <Protected>
                  <OrderDetail />
                </Protected>
              }
            />
            <Route
              path="*"
              element={
                <div className="shell py-20">
                  <h1>Không tìm thấy trang</h1>
                </div>
              }
            />
          </Routes>
        </Layout>
      </ShopProvider>
    </BrowserRouter>
  );
}
