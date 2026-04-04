const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());

const DOMAIN = process.env.DOMAIN || 'https://cadivina.it';

const PRODUCTS = {
  'legame-075': {
    priceId: 'price_1TGgzYLICPkyl0gP7vAAKT9Q',
    unitAmount: 700,
    promoEligible: true,
    equivalent075: 1,
    name: 'LEGAME 0,75 L'
  },
  'armonia-075': {
    priceId: 'price_1TGgyRLICPkyl0gPifDU09wp',
    unitAmount: 500,
    promoEligible: true,
    equivalent075: 1,
    name: 'ARMONIA 0,75 L'
  },
  'abbandonato-0375': {
    priceId: 'price_1TGgvRLICPkyl0gPoNZD4ELt',
    unitAmount: 1000,
    promoEligible: false,
    equivalent075: 0.5,
    name: "L'ABBANDONATO 0,375 L"
  },
  'dissenso-075': {
    priceId: 'price_1TGgtQLICPkyl0gPLdkcE12M',
    unitAmount: 700,
    promoEligible: true,
    equivalent075: 1,
    name: 'DISSENSO 0,75 L'
  },
  'memento-075': {
    priceId: 'price_1TGgrNLICPkyl0gP0xMwx65l',
    unitAmount: 700,
    promoEligible: true,
    equivalent075: 1,
    name: 'MEMENTO 0,75 L'
  },
  'inceppo-075': {
    priceId: 'price_1TGgoRLICPkyl0gPCVF3ZyE3',
    unitAmount: 800,
    promoEligible: true,
    equivalent075: 1,
    name: 'INCEPPO 0,75 L'
  },
  'esordio-150': {
    priceId: 'price_1SiWWLICPkyl0gPtZ48zBAZ',
    unitAmount: 2500,
    promoEligible: false,
    equivalent075: 3,
    name: 'ESORDIO 1,5 L'
  },
  'imprevisto-150': {
    priceId: 'price_1SiVfLICPkyl0gPMsM851Wc',
    unitAmount: 3000,
    promoEligible: false,
    equivalent075: 3,
    name: 'IMPREVISTO 1,5 L'
  },
  'arturus-075': {
    priceId: 'price_1SiRxLICPkyl0gPXgirnVHn',
    unitAmount: 1200,
    promoEligible: true,
    equivalent075: 1,
    name: 'ARTURUS 0,75 L'
  },
  'imprevisto-075': {
    priceId: 'price_1SiiQmLICPkyl0gPDds6dS8J',
    unitAmount: 1400,
    promoEligible: true,
    equivalent075: 1,
    name: 'IMPREVISTO 0,75 L'
  },
  'esordio-075': {
    priceId: 'price_1SiiPgLICPkyl0gPPDQ3D2Ky',
    unitAmount: 1200,
    promoEligible: true,
    equivalent075: 1,
    name: 'ESORDIO 0,75 L'
  }
};

const SHIPPING_RATES = [
  { maxEq: 1, amount: 1400 },
  { maxEq: 2, amount: 1450 },
  { maxEq: 3, amount: 1500 },
  { maxEq: 4, amount: 1600 },
  { maxEq: 6, amount: 1700 },
  { maxEq: 9, amount: 2000 },
  { maxEq: 12, amount: 2400 },
  { maxEq: 18, amount: 2900 },
  { maxEq: 24, amount: 3300 },
  { maxEq: 30, amount: 3800 },
  { maxEq: 36, amount: 4300 },
  { maxEq: 42, amount: 4800 },
  { maxEq: 48, amount: 6500 },
  { maxEq: 54, amount: 7000 },
  { maxEq: 60, amount: 8000 }
];

function calculateShipping(eqBottles) {
  if (eqBottles <= 0) return 0;

  const found = SHIPPING_RATES.find((r) => eqBottles <= r.maxEq);
  if (found) return found.amount;

  const extra = eqBottles - 60;
  const extraBlocks = Math.ceil(extra / 6);
  return 8000 + extraBlocks * 800;
}

function calculateDiscountAmount(normalizedItems) {
  const eligibleUnitPrices = normalizedItems
    .filter((item) => item.promoEligible)
    .flatMap((item) => Array(item.quantity).fill(item.unitAmount))
    .sort((a, b) => a - b);

  const freeBottles = Math.floor(eligibleUnitPrices.length / 6);

  return eligibleUnitPrices
    .slice(0, freeBottles)
    .reduce((sum, amount) => sum + amount, 0);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatEuroFromCents(amountInCents) {
  return `€ ${(Number(amountInCents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

function getMailTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function handleCompletedCheckout(session) {
  const sessionWithLines = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items']
  });

  const customerEmail =
    sessionWithLines.customer_details?.email ||
    session.customer_details?.email ||
    session.customer_email ||
    '';

  const customerName =
    sessionWithLines.customer_details?.name ||
    session.customer_details?.name ||
    session.shipping_details?.name ||
    'Cliente';

  const totalAmount = sessionWithLines.amount_total || 0;
  const items = sessionWithLines.line_items?.data || [];
  const shippingDetails = sessionWithLines.shipping_details || {};
  const address = shippingDetails.address || {};

  const itemsHtml = items
    .map((item) => {
      const description = escapeHtml(item.description || 'Prodotto');
      const quantity = Number(item.quantity || 0);
      const lineTotal = formatEuroFromCents(item.amount_total || 0);
      return `<li>${description} × ${quantity} — ${lineTotal}</li>`;
    })
    .join('');

  const addressHtml = `
    ${escapeHtml(shippingDetails.name || '')}<br>
    ${escapeHtml(address.line1 || '')} ${escapeHtml(address.line2 || '')}<br>
    ${escapeHtml(address.postal_code || '')} ${escapeHtml(address.city || '')} ${escapeHtml(address.state ? '(' + address.state + ')' : '')}<br>
    ${escapeHtml(address.country || '')}
  `;

  const transporter = getMailTransporter();

  if (customerEmail) {
    await transporter.sendMail({
      from: `"Ca’ Divina" <${process.env.MAIL_FROM}>`,
      to: customerEmail,
      subject: 'Grazie per il tuo acquisto — Ca’ Divina',
      html: `
        <h2>Grazie per il tuo ordine, ${escapeHtml(customerName)}</h2>
        <p>Abbiamo ricevuto correttamente il tuo pagamento.</p>
        <p><strong>Riepilogo ordine:</strong></p>
        <ul>${itemsHtml}</ul>
        <p><strong>Totale pagato:</strong> ${formatEuroFromCents(totalAmount)}</p>
        <p>Ti invieremo il prima possibile il tuo ordine.</p>
        <p>Grazie per aver scelto Ca’ Divina.</p>
      `
    });
  }

  if (process.env.NOTIFY_EMAIL) {
    await transporter.sendMail({
      from: `"Ca’ Divina Shop" <${process.env.MAIL_FROM}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: 'Nuovo ordine ricevuto su Ca’ Divina',
      html: `
        <h2>Nuovo ordine pagato</h2>
        <p><strong>Cliente:</strong> ${escapeHtml(customerName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(customerEmail || 'non disponibile')}</p>
        <p><strong>Totale:</strong> ${formatEuroFromCents(totalAmount)}</p>
        <p><strong>Prodotti:</strong></p>
        <ul>${itemsHtml}</ul>
        <p><strong>Indirizzo spedizione:</strong><br>${addressHtml}</p>
        <p><strong>ID sessione Stripe:</strong> ${escapeHtml(session.id)}</p>
      `
    });
  }
}

app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;

  try {
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Errore firma webhook Stripe:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCompletedCheckout(event.data.object);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Errore nella gestione del webhook Stripe:', error.message);
    console.error(error);
    return res.status(500).send('Errore interno webhook');
  }
});

app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Carrello vuoto o non valido' });
    }

    const normalizedItems = items.map((item) => {
      const product = PRODUCTS[item.id];
      const quantity = Number(item.quantity);

      if (!product) {
        throw new Error(`Prodotto non valido: ${item.id}`);
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`Quantità non valida per: ${item.id}`);
      }

      return {
        id: item.id,
        quantity,
        ...product
      };
    });

    const line_items = normalizedItems.map((item) => ({
      price: item.priceId,
      quantity: item.quantity
    }));

    const eqBottles = normalizedItems.reduce(
      (sum, item) => sum + item.quantity * item.equivalent075,
      0
    );

    const shippingAmount = calculateShipping(eqBottles);
    const discountAmount = calculateDiscountAmount(normalizedItems);

    let discounts = [];
    if (discountAmount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: discountAmount,
        currency: 'eur',
        duration: 'once',
        name: 'Sconto promo 6x5'
      });

      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      discounts,
      success_url: `${DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel.html`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['IT']
      },
      shipping_options: shippingAmount > 0
        ? [
            {
              shipping_rate_data: {
                type: 'fixed_amount',
                display_name: 'Spedizione Italia',
                fixed_amount: {
                  amount: shippingAmount,
                  currency: 'eur'
                }
              }
            }
          ]
        : [],
      customer_creation: 'always',
      phone_number_collection: {
        enabled: true
      },
      locale: 'it'
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error('Errore Stripe:', error);
    return res.status(500).json({
      error: error.message || 'Errore nella creazione del checkout'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
