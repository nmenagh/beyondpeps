insert into public.email_templates (id, name, category, subject, preview_text, header_image_url, body_html)
values
  (
    'order_paid',
    'Order payment received',
    'transactional',
    'Payment received for Beyond Peps order {{order_number}}',
    'Your payment has been matched to your order.',
    '/assets/bp-logo-mark.png',
    '<h1>Payment received</h1><p>Hi {{customer_name}},</p><p>Payment for order <strong>{{order_number}}</strong> has been received. We will prepare your order and send tracking details when it ships.</p>'
  ),
  (
    'order_fulfilled',
    'Order fulfilled',
    'transactional',
    'Beyond Peps order {{order_number}} fulfilled',
    'Your order has been fulfilled.',
    '/assets/bp-logo-mark.png',
    '<h1>Order fulfilled</h1><p>Hi {{customer_name}},</p><p>Order <strong>{{order_number}}</strong> has been fulfilled. Tracking information will appear in your account when available.</p>'
  ),
  (
    'order_cancelled',
    'Order cancelled',
    'transactional',
    'Beyond Peps order {{order_number}} cancelled',
    'Your order has been cancelled.',
    '/assets/bp-logo-mark.png',
    '<h1>Order cancelled</h1><p>Hi {{customer_name}},</p><p>Order <strong>{{order_number}}</strong> has been cancelled. Contact us if you have questions about this change.</p>'
  ),
  (
    'order_refunded',
    'Order refunded',
    'transactional',
    'Beyond Peps order {{order_number}} refunded',
    'Your order has been refunded.',
    '/assets/bp-logo-mark.png',
    '<h1>Refund processed</h1><p>Hi {{customer_name}},</p><p>A refund has been recorded for order <strong>{{order_number}}</strong>. Processing time may vary by payment provider.</p>'
  )
on conflict (id) do nothing;
