  import React from 'react';
import { Package } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
// Adjust the import based on the actual exports from ../services/api
import { productsService, Order as OrderType } from '../services/api';
import { ordersService } from '../services/api_part2_part'; // Update this path to where ordersService is actually exported
import { format } from 'date-fns';
import { Badge } from './ui/badge';
import { CheckCircle, Clock, Loader, Truck, XCircle } from 'lucide-react';
import { hydrateOrdersWithProducts } from './hydrateOrderProducts';

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return <Clock className="h-4 w-4" />;
    case 'processing':
      return <Loader className="h-4 w-4" />;
    case 'shipped':
      return <Truck className="h-4 w-4" />;
    case 'delivered':
      return <CheckCircle className="h-4 w-4" />;
    case 'canceled':
      return <XCircle className="h-4 w-4" />;
    default:
      return null;
  }
};

const getStatusBadge = (status: string) => {
  let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "default";
  switch (status.toLowerCase()) {
    case 'delivered':
      badgeVariant = "default";
      break;
    case 'processing':
    case 'shipped':
      badgeVariant = "secondary";
      break;
    case 'canceled':
      badgeVariant = "destructive";
      break;
    case 'pending':
    default:
      badgeVariant = "outline";
  }
  return (
    <Badge variant={badgeVariant} className="flex items-center gap-1">
      {getStatusIcon(status)}
      <span className="capitalize">{status}</span>
    </Badge>
  );
};

const OrdersDialog = () => {
  const { data: ordersRaw, isLoading } = useQuery<OrderType[]>({
    queryKey: ['orders'],
    queryFn: ordersService.getOrders,
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getProducts,
  });

  const queryClient = useQueryClient();

  const cancelOrderMutation = useMutation<void, Error, OrderType>({
    mutationFn: async (order) => {
      console.log('Canceling order with id:', order.id);
      await ordersService.cancelOrder(order.id);
      await Promise.all(
        order.items.map((item: any) => {
          const currentStock = typeof item.product?.stock === 'number' ? item.product.stock : 0;
          const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
          const newStock = currentStock + quantity;
          return productsService.updateProductStock(item.product?.id ?? '', newStock);
        })
      );
    },
    onSuccess: () => {
      console.log('Order canceled successfully, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  const cancelOrderItemMutation = useMutation<void, Error, { orderId: string; itemId: string }>({
    mutationFn: async ({ orderId, itemId }) => {
      console.log('Canceling order item with id:', itemId, 'in order:', orderId);
      await ordersService.cancelOrderItem(orderId, itemId);
    },
    onSuccess: (_data, variables) => {
      const { itemId } = variables;
      console.log('Order item canceled successfully, updating cache for itemId:', itemId);
      queryClient.setQueryData<OrderType[]>(['orders'], (oldOrders) => {
        if (!oldOrders) return oldOrders;
        return oldOrders.map(order => ({
          ...order,
          items: order.items.filter(item => item.id !== itemId)
        })).filter(order => order.items.length > 0);
      });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  // Hydrate ordersRaw with product info for rendering
  const hydratedOrders = React.useMemo(() => {
    if (ordersRaw && Array.isArray(products)) {
      const productMap: Record<string, any> = {};
      products.forEach((p: any) => {
        productMap[String(p.id)] = p;
      });
      const hydratedOrdersRaw = ordersRaw.map(order => ({
        totalAmount: (order as any).totalAmount ?? 0,
        paymentMethod: (order as any).paymentMethod ?? '',
        shippingAddress: (order as any).shippingAddress ?? '',
        createdAt: (order as any).createdAt ?? (order as any).created_at ?? '',
        updatedAt: (order as any).updatedAt ?? (order as any).updated_at ?? '',
        ...order,
        items: order.items.map((item: any) => {
          const productId = item.product?.id || item.product_id;
          const fullProduct = productMap[String(productId)] || {
            id: productId,
            name: item.product_details?.name || item.product?.name || '',
            price: item.product_details?.price || item.product?.price || 0,
            category: item.product_details?.category || item.product?.category || 'essentials',
            image: item.product_details?.image || item.product?.image || '',
          };
          return {
            ...item,
            product: {
              ...fullProduct,
              category: fullProduct.category || 'essentials',
              image: fullProduct.image || '',
            },
          };
        }),
      }));
      return hydrateOrdersWithProducts(hydratedOrdersRaw, products) as unknown as OrderType[];
    }
    return ordersRaw;
  }, [ordersRaw, products]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Package className="h-5 w-5" />
          {hydratedOrders && hydratedOrders.filter(order => order.status.toLowerCase() !== 'canceled').length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[10px] text-white">
              {hydratedOrders
                .filter(order => order.status.toLowerCase() !== 'canceled')
                .reduce((total, order) => total + order.items.reduce((sum, item) => sum + (item.quantity || 0), 0), 0)}
            </span>
          )}
        </Button>
      </DialogTrigger>
   
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Your Orders</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-4">Loading orders...</div>
        ) : !Array.isArray(hydratedOrders) || !hydratedOrders.length ? (
          <div className="text-center py-4 text-muted-foreground">
            {Array.isArray(hydratedOrders)
              ? 'No orders found'
              : 'Failed to load orders. Please sign in.'}
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto space-y-8">
            {hydratedOrders
              .filter(order => order.status.toLowerCase() !== 'canceled')
              .map((order) => {
                const createdDate = order.created_at || '';
                const formattedDate = createdDate
                  ? format(new Date(createdDate), 'MMM d, yyyy')
                  : 'N/A';

                return (
                  <section key={order.id} className="border-b last:border-b-0 pb-6">
                    <h2 className="mb-4 font-semibold text-lg hidden">Order {order.id.substring(0, 8)}...</h2>
                    <div className="flex flex-col space-y-2">
                      {/* Header Row */}
                      <div className="hidden md:flex bg-gray-100 rounded-md px-3 py-2 text-center text-sm font-semibold text-gray-700">
                        <div className="flex-1 text-left- w-[20px] ">Image</div>
                        <div className="flex-1 flex justify-center min-w-[80px]">Product Name</div>
                        <div className="flex-1 flex justify-center w-[100px]">Total Price</div>
                        <div className="flex-1 flex justify-center w-[120px]">Date</div>
                        <div className="flex-1 flex justify-center w-[150px]">Status</div>
                      </div>
                      {/* Product Rows */}
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap md:flex-nowrap items-center border rounded-md px-5 gap-4 md:gap-0"
                        >
                          {/* Image */}
                          <div className="flex-shrink-0 w-[120px] h-[120px] rounded-md overflow-hidden">
                              <img
                                src={(item?.product as any)?.image || '/placeholder.svg'}
                                alt={item?.product?.name || 'Product image'}
                                className="w-full h-full object-cover"
                              />
                          </div>
                          {/* Product Name & Quantity */}
                          <div className="flex-1 flex flex-col items-center md:items-center text-center md:text-center min-w-[150px]">
                            <div className="font-medium">{item?.product?.name || 'Unknown Product'}</div>
                            <div>x {item.quantity}</div>
                          </div>
                          {/* Total Price */}
                          <div className="flex-1 flex justify-center items-center w-[100px] text-center">
                          ₱{ (item.price * item.quantity).toFixed(2) }
                          </div>
                          {/* Date */}
                          <div className="flex-1 flex justify-center items-center w-[120px] text-center">
                            {formattedDate}
                          </div>
                          {/* Status */}
                          <div className="flex-1 flex justify-center items-center w-[150px] text-center">
                            <div className=" items-center space-y-2">
                              {getStatusBadge(order.status)}
                              {(order.status.toLowerCase() === 'pending' || order.status.toLowerCase() === 'processing') && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => cancelOrderItemMutation.mutate({ orderId: order.id, itemId: item.id })}
                                  disabled={cancelOrderItemMutation.status === 'pending'}
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
          </div>
        )}
      </DialogContent>
.
    </Dialog>
  );
};

export default OrdersDialog;
