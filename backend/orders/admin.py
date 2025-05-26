
from django.contrib import admin
from .models import Order, OrderItem

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('product', 'quantity', 'price')

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'status', 'payment_method', 'created_at')
    list_filter = ('status', 'payment_method', 'created_at')
    search_fields = ('user__email', 'shipping_first_name', 'shipping_last_name')
    inlines = [OrderItemInline]
    readonly_fields = ('created_at', 'updated_at')
    
    # Add status as a list_editable field to allow inline editing
    list_editable = ('status',)
    
    # Customize the status dropdown in the admin
    def formfield_for_choice_field(self, db_field, request, **kwargs):
        if db_field.name == 'status':
            kwargs['choices'] = Order.STATUS_CHOICES
        return super().formfield_for_choice_field(db_field, request, **kwargs)

@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'get_user_email', 'product', 'quantity', 'price')
    list_filter = ('product',)
    search_fields = ('order__id', 'product__name', 'order__user__email')
    readonly_fields = ()
    
    def get_user_email(self, obj):
        return obj.order.user.email
    get_user_email.short_description = 'User Email'
    
