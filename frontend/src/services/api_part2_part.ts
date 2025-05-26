import { API_URL, getHeaders, refreshAuthToken, setSignOutCallback } from './api_part1_part';
import type {
  CartItem,
  DjangoAddress,
  DjangoOrderCreate,
  Order,
} from './api_types';

// Cache for GET requests
const cache = new Map<string, any>();

// Timeout helper
const fetchWithTimeout = (url: string, options: RequestInit, timeout = 10000): Promise<Response> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), timeout);
    fetch(url, options)
      .then(response => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

// Token refresh lock and queue to prevent multiple simultaneous refreshes
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
};

// Enhanced fetch wrapper with improved error handling, token refresh, caching, timeout, and retry
export async function apiRequest<T>(
  endpoint: string, 
  method: string = 'GET', 
  data?: any, 
  requireAuth: boolean = true,
  retryCount: number = 1
): Promise<T> {
  const cacheKey = `${method}:${endpoint}:${data ? JSON.stringify(data) : ''}`;
  
  // Return cached response for GET requests if available
  if (method === 'GET' && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const headers = getHeaders(requireAuth);
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  const url = `${API_URL}/${endpoint}`;
  
  const startTime = Date.now();
  
  let response: Response;
  
  try {
    response = await fetchWithTimeout(url, options, 10000);
  } catch (error) {
    if (retryCount > 0) {
      return apiRequest<T>(endpoint, method, data, requireAuth, retryCount - 1);
    }
    throw error;
  }
  
  const duration = Date.now() - startTime;
  
  const contentLength = response.headers.get('content-length') || 'unknown';
  console.log(`[API] ${method} ${endpoint} - Status: ${response.status} - Duration: ${duration}ms - Size: ${contentLength} bytes`);
  
  if (response.status === 401 && requireAuth) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAuthToken();
      if (newToken) {
        isRefreshing = false;
        onRefreshed(newToken);
        // Retry original request with new token
        const newHeaders = getHeaders(requireAuth);
        options.headers = newHeaders;
        response = await fetchWithTimeout(url, options, 10000);
      } else {
        isRefreshing = false;
        // Call signOut callback on refresh failure
        if (typeof setSignOutCallback === 'function') {
          setSignOutCallback(() => {
            // Sign out user on token refresh failure
            window.location.href = '/login'; // Redirect to login page
            localStorage.removeItem('authTokens');
            localStorage.removeItem('user');
          });
        }
        throw new Error('Unauthorized: Token refresh failed');
      }
    } else {
      // Wait for token refresh to complete before retrying
      await new Promise<void>((resolve, reject) => {
        subscribeTokenRefresh(async (token) => {
          try {
            const newHeaders = getHeaders(requireAuth);
            options.headers = newHeaders;
            response = await fetchWithTimeout(url, options, 10000);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Wrong email format try again`);
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  const json = await response.json();
  
  // Cache GET responses
  if (method === 'GET') {
    cache.set(cacheKey, json);
  }
  
  return json;
}

// Auth API endpoints
export const authService = {
  refreshToken: (refreshToken: string) => {
    return fetch(`${API_URL}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    }).then(res => {
      if (!res.ok) throw new Error('Failed to refresh token');
      return res.json();
    });
  },
  signIn: (email: string, password: string) => {
    return apiRequest<{ token: string; refresh: string; user: any }>('auth/login/', 'POST', { email, password });
  },

  signUp: (first_name: string, last_name: string, email: string, password: string) => {
    return apiRequest<{ token: string; refresh: string; user: any }>('auth/register/', 'POST', {
      first_name,
      last_name,
      email,
      password,
      password_confirm: password,
    }, false);
  },
  
  getUserProfile: () => 
    apiRequest<any>('auth/profile/'),
    
  getUserAddresses: () =>
    apiRequest<DjangoAddress[]>('auth/addresses/'),
    
  createAddress: (addressData: Omit<DjangoAddress, 'id'>) =>
    apiRequest<DjangoAddress>('auth/addresses/', 'POST', addressData),
    
  updateAddress: (id: string, addressData: Partial<DjangoAddress>) =>
    apiRequest<DjangoAddress>(`auth/addresses/${id}/`, 'PATCH', addressData),
    
  deleteAddress: (id: string) =>
    apiRequest<void>(`auth/addresses/${id}/`, 'DELETE'),
};

// Product API endpoints

export const productsService = {
  updateProductStock: (productId: string, newStock: number) =>
    apiRequest(`products/${productId}/`, 'PATCH', { stock: newStock }),
  getProducts: () => 
  apiRequest<any[]>('products/', 'GET', undefined, false).then(products => {
    return products;
  }),
  
  getProductsByCategory: (category: string) => 
    apiRequest<any[]>(`products/?category=${category}`, 'GET', undefined, false),
  
  getProductById: (id: string) => 
    apiRequest<any>(`products/${id}/`, 'GET', undefined, false),
  
  getBestSellers: () => 
    apiRequest<any[]>('products/bestsellers/', 'GET', undefined, false),
};

export const ordersService = {
  cancelOrder: (orderId: string) => apiRequest(`orders/${orderId}/cancel/`, 'POST'),
  cancelOrderItem: (orderId: string, itemId: string) => apiRequest(`orders/${orderId}/cancel-item/`, 'POST', { item_id: itemId }),
  updateOrderStatus: (orderId: string, status: string) =>
    apiRequest(`orders/${orderId}/`, 'PATCH', { status }),
  createOrder: (orderData: DjangoOrderCreate) => 
    apiRequest<Order>('orders/', 'POST', orderData),
  
  getOrders: () =>
    apiRequest<Order[]>('orders/')
      .then(orders => {
        if (!Array.isArray(orders)) {
          return [];
        }
        return orders;
      }),
  
  getOrderById: (id: string) => 
    apiRequest<Order>(`orders/${id}/`),

  getUserCart: () =>
    apiRequest<CartItem[]>('orders/cart/', 'GET',undefined, true ),

  addItemToCart: (productId: string, quantity: number) =>
    apiRequest('orders/cart/add/', 'POST', { product_id: productId, quantity }),

  removeItemFromCart: (productId: string) =>
    apiRequest('orders/cart/remove/', 'POST', { product_id: productId }),

  updateItemQuantity: (productId: string, quantity: number) =>
    apiRequest('orders/cart/update-quantity/', 'POST', { product_id: productId, quantity }),

  mergeCart: (guestCart: CartItem[]) =>
    apiRequest('orders/cart/merge/', 'POST', { items: guestCart }),

  clearCart: () =>
    apiRequest('orders/cart/clear/', 'POST'),
};
