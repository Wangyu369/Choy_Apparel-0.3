export type CartItem = {
  product: {
    id: string;
    name: string;
    price: number;
  };
  quantity: number;
};

export type DjangoAddress = {
  id: string;
  user: string; // user id
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  product: {
    id: string;
    name: string;
    price: number;
  };
  quantity: number;
  price: number;
};

export type DjangoOrderCreate = {
  items: {
    product_id: string;
    quantity: number;
    price: number;
  }[];
  total_amount: number;
  payment_method: 'paypal' | 'cod';
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
  shipping_phone: string;
};

export type Order = {
  id: string;
  total_amount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'canceled';
  payment_method: 'paypal' | 'cod';
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
  shipping_phone: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
};
