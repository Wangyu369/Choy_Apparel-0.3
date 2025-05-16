import React from 'react';
import { format } from 'date-fns';
import { CheckCircle, Clock, Loader, Truck, XCircle } from 'lucide-react';
import { Order, OrderStatus } from '../utils/products.types';
import { Badge } from './ui/badge';

type OrderListProps = {
  orders: Order[];
};

const OrderList: React.FC<OrderListProps> = ({ orders }) => {
  // Helper to get appropriate icon for status
  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
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

  // Helper to get status badge based on order status
  const getStatusBadge = (status: OrderStatus) => {
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "default";

    switch (status) {
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

  // Sort orders by date (most recent first)
  const sortedOrders = [...orders].sort((a, b) => {
    const dateA = new Date(a.createdAt || '').getTime();
    const dateB = new Date(b.createdAt || '').getTime();
    return dateB - dateA;
  });

  return (
    <div className="max-h-[600px] overflow-y-auto border rounded-lg p-4 space-y-8">
      {sortedOrders.map((order) => {
        const orderId = order.id;
        const createdDate = order.createdAt || '';
        const formattedDate = createdDate
          ? format(new Date(createdDate), 'MMM d, yyyy')
          : 'N/A';

        return (
          <section key={orderId} className="border-b last:border-b-0 pb-6">
            <h2 className="mb-4 font-semibold text-lg">Order {orderId.substring(0, 8)}...</h2>
            <div className="flex flex-col space-y-2">
              {/* Header Row */}
              <div className="hidden md:flex bg-gray-100 rounded-md px-3 py-2 text-center text-sm font-semibold text-gray-700">
                <div className="flex-1 text-left w-[70px]">Image</div>
                <div className="flex-1 flex justify-center min-w-[150px]">Product Name & Quantity</div>
                <div className="flex-1 flex justify-center w-[100px]">Total Price</div>
                <div className="flex-1 flex justify-center w-[120px]">Date</div>
                <div className="flex-1 flex justify-center w-[150px]">Status</div>
              </div>
              {/* Product Rows */}
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap md:flex-nowrap items-center border rounded-md px-3 py-3 gap-4 md:gap-0"
                >
                  {/* Image */}
                  <div className="flex-shrink-0 w-[60px] h-[60px] rounded-md overflow-hidden">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* Product Name & Quantity */}
                  <div className="flex-1 flex flex-col items-center md:items-center text-center md:text-center min-w-[150px]">
                    <div className="font-medium">{item.product.name}</div>
                    <div>Quantity: {item.quantity}</div>
                  </div>
                  {/* Total Price */}
                  <div className="flex-1 flex justify-center items-center w-[100px] text-center">
                    ${ (item.price * item.quantity).toFixed(2) }
                  </div>
                {/* Date */}
                {createdDate && !isNaN(new Date(createdDate).getTime()) && (
                  <div className="flex-1 flex justify-center items-center w-[120px] text-center">
                    {formattedDate}
                  </div>
                )}
                  {/* Status */}
                  <div className="flex-1 flex justify-center items-center w-[150px] text-center">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status)}
                      <button
                        className="text-red-600 hover:text-red-800 text-sm font-semibold"
                        onClick={() => {
                          // Implement cancel functionality here
                          alert(`Cancel order ${orderId} functionality not implemented yet.`);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default OrderList;
