import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { ordersService } from '../services/api';
import { Product } from '../utils/products.types';


type CartItem = {
  product: Product;
  quantity: number;
};

type CartContextType = {
  items: CartItem[];
  selectedItems: string[];
  setSelectedItems: React.Dispatch<React.SetStateAction<string[]>>;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  setItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const { user, isAuthenticated, signOut } = useAuth();
  const syncingRef = useRef(false);
  const initialLoadRef = useRef(true);
  const lastSyncedItemsRef = useRef<CartItem[]>([]);

  // Function to update cart after order placement by removing ordered items
  const updateCartAfterOrder = (orderedProductIds: string[]) => {
    setItems(currentItems => {
      const updatedItems = currentItems.filter(item => !orderedProductIds.includes(item.product.id));
      // Update localStorage with updated cart
      try {
        localStorage.setItem('cart', JSON.stringify(updatedItems));
        console.log('updateCartAfterOrder: Updated localStorage cart after order:', updatedItems);
      } catch (error) {
        console.error('updateCartAfterOrder: Failed to update localStorage cart:', error);
      }
      return updatedItems;
    });
  };

  const mergeCarts = (cartA: CartItem[], cartB: CartItem[]): CartItem[] => {
    const mergedMap = new Map<string, CartItem>();
    cartA.forEach(item => mergedMap.set(item.product.id, { ...item }));
    cartB.forEach(item => {
      if (mergedMap.has(item.product.id)) {
        mergedMap.get(item.product.id)!.quantity += item.quantity;
      } else {
        mergedMap.set(item.product.id, { ...item });
      }
    });
    return Array.from(mergedMap.values());
  };


  useEffect(() => {
    const loadCart = async () => {
      // Check if checkoutComplete flag is set in localStorage
      const checkoutComplete = localStorage.getItem('checkoutComplete');
      if (checkoutComplete === 'true') {
        // Remove the checkoutComplete flag but do not clear the cart or backend
        localStorage.removeItem('checkoutComplete');
        lastSyncedItemsRef.current = [];
        initialLoadRef.current = false;

        // Do not clear the cart or backend here to allow individual item removal

        return;
      }

      const storedCart = localStorage.getItem('cart');
      let localCart: CartItem[] = [];
      if (storedCart) {
        try {
          localCart = JSON.parse(storedCart);
        } catch (error) {
          console.error('Failed to parse stored cart:', error);
          // Do not remove cart here to avoid losing data on parse error
          // localStorage.removeItem('cart');
        }
      }

      if (isAuthenticated && user) {
        try {
          const cartMerged = localStorage.getItem('cartMerged');
          const isNewUser = localStorage.getItem('isNewUser') === 'true';
          // Merge guest cart items into backend cart only if user is new and not merged before
          if (localCart.length > 0 && cartMerged !== 'true' && isNewUser) {
            await ordersService.mergeCart(localCart);
            localStorage.setItem('cartMerged', 'true');
          }
          // Fetch merged cart from backend
          const backendCart = await ordersService.getUserCart();
          console.log('Backend cart fetched on login:', backendCart);
          const mappedBackendCart = backendCart.map((item: any) => ({
            product: item.product_details,
            quantity: item.quantity,
          }));
          if (mappedBackendCart.length > 0) {
            setItems(mappedBackendCart);
            lastSyncedItemsRef.current = mappedBackendCart; // Set last synced items on login
            // Clear localStorage cart only if backend cart is non-empty
            localStorage.removeItem('cart');
          } else {
            // If backend cart is empty, fallback to local cart and preserve localStorage cart
            setItems(localCart);
            lastSyncedItemsRef.current = localCart;
          }
          // Initialize selectedItems with all product IDs if empty
          if (mappedBackendCart.length > 0) {
            setSelectedItems(mappedBackendCart.map(item => item.product.id));
          } else {
            setSelectedItems(localCart.map(item => item.product.id));
          }
          initialLoadRef.current = false; // Mark initial load done
        } catch (error) {
          console.error('Failed to load user cart:', error);
          setItems(localCart);
          lastSyncedItemsRef.current = localCart;
          setSelectedItems(localCart.map(item => item.product.id));
          initialLoadRef.current = false;
        }
      } else {
        setItems(localCart);
        lastSyncedItemsRef.current = localCart;
        setSelectedItems(localCart.map(item => item.product.id));
        initialLoadRef.current = false;
      }
    };
    loadCart();
  }, [isAuthenticated, user]);

  // Add logout handler to clear cart on logout
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('Logout detected: Clearing cart state but preserving localStorage cart for persistence');
      setItems([]);
      setSelectedItems([]);
      // Do NOT remove localStorage 'cart' here to preserve cart across logouts
      // Remove only cartMerged flag as it is related to backend merge state
      localStorage.removeItem('cartMerged');
      initialLoadRef.current = true;
      lastSyncedItemsRef.current = [];
    }
  }, [isAuthenticated]);

  // Save cart to localStorage on items change
  useEffect(() => {
    try {
      localStorage.setItem('cart', JSON.stringify(items));
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  }, [items]);

  // Sync cart to backend with debounce and error handling
  useEffect(() => {
    console.log('CartContext syncing useEffect triggered. Items:', items);
    if (!isAuthenticated || !user) {
      console.log('Not authenticated or no user, skipping sync');
      return;
    }

    if (initialLoadRef.current) {
      // Skip syncing on initial load to avoid quantity increments
      console.log('Initial load, skipping sync');
      return;
    }

    if (syncingRef.current) {
      console.log('Already syncing, skipping this sync');
      return;
    }
    syncingRef.current = true;

    let debounceTimeout: NodeJS.Timeout;

    const syncCartToBackend = async () => {
      try {
        const lastSyncedItems = lastSyncedItemsRef.current;
        const currentItems = items;
        const currentSelectedItems = selectedItems;

        console.log('Syncing cart to backend. Last synced items:', lastSyncedItems);
        console.log('Current items:', currentItems);
        console.log('Current selected items:', currentSelectedItems);

        // Helper to create a map from productId to CartItem
        const mapByProductId = (arr: CartItem[]) => {
          const map = new Map<string, CartItem>();
          arr.forEach(item => map.set(item.product.id, item));
          return map;
        };

        const lastMap = mapByProductId(lastSyncedItems);
        const currentMap = mapByProductId(currentItems);

        // Detect removed items (in last but not in current and selected)
        for (const [productId, lastItem] of lastMap.entries()) {
          if (!currentMap.has(productId) && currentSelectedItems.includes(productId)) {
            console.log('Removing item from backend cart:', productId);
            await ordersService.removeItemFromCart(productId);
          }
        }

        // Detect added or updated items (only for selected items)
        for (const [productId, currentItem] of currentMap.entries()) {
          if (!currentSelectedItems.includes(productId)) {
            continue; // Skip items not selected
          }
          const lastItem = lastMap.get(productId);
          if (!lastItem) {
            console.log('Adding item to backend cart:', productId, currentItem.quantity);
            await ordersService.addItemToCart(productId, currentItem.quantity);
          } else if (lastItem.quantity !== currentItem.quantity) {
            console.log('Updating item quantity in backend cart:', productId, currentItem.quantity);
            await ordersService.updateItemQuantity(productId, currentItem.quantity);
          }
        }

        // Update last synced items only for selected items
        lastSyncedItemsRef.current = currentItems.filter(item => currentSelectedItems.includes(item.product.id));
        } catch (error: any) {
          console.error('Failed to sync cart to backend:', error);
          if (error.message.includes('Unauthorized')) {
            // Force logout on unauthorized error
            signOut();
            toast.error('Session expired. Please log in again.');
          }
        } finally {
          syncingRef.current = false;
        }
      };

    debounceTimeout = setTimeout(() => {
      syncCartToBackend();
    }, 500);

    // Debounce sync by 500ms
    return () => clearTimeout(debounceTimeout);
  }, [items, isAuthenticated, user, selectedItems, signOut]);

  const addItem = (product: Product, quantity = 1) => {
    setItems(currentItems => {
      const existingItem = currentItems.find(item => item.product.id === product.id);
      if (existingItem) {
        const updatedItems = currentItems.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
        toast.success(`Updated ${product.name} quantity in cart`);
        return updatedItems;
      } else {
        toast.success(`Added ${product.name} to cart`);
        return [...currentItems, { product, quantity }];
      }
    });
  };

  const removeItem = (productId: string) => {
    setItems(currentItems => {
      const item = currentItems.find(item => item.product.id === productId);
      if (item) {
        toast.success(`Removed ${item.product.name} from cart`);
      }
      return currentItems.filter(item => item.product.id !== productId);
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems(currentItems =>
      currentItems.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    toast.success('Cart cleared');
    // Remove all cart related localStorage keys immediately
    localStorage.removeItem('cart');
    localStorage.removeItem('cartMerged');
    localStorage.removeItem('checkoutComplete');
  };

  const totalItems = items.reduce((total, item) => total + item.quantity, 0);

  const totalPrice = items.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        selectedItems,
        setSelectedItems,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        setItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export { CartProvider };
