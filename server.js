require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const DOMAIN = process.env.DOMAIN;
const PORT = process.env.PORT || 3000;

if (!STRIPE_SECRET_KEY) {
  throw new Error('Variabile ambiente mancante: STRIPE_SECRET_KEY');
}

if (!DOMAIN) {
  throw new Error('Variabile ambiente mancante: DOMAIN');
}

const stripe = Stripe(STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const PRODUCTS = {
  'imprevisto-075': {
    priceId: 'price_1SiiQmLICPkyl0gPDds6dS8J',
    unitAmount: 1400,
    promoEligible: true,
    equivalent075: 1,
    name: 'IMPREVISTO 0,75 L'
  },
  'imprevisto-150': {
    priceId: 'price_1SiVfLICPkyl0gPMsM851Wc',
    unitAmount: 3000,
    promoEligible: false,
    equivalent075: 3,
    name: 'IMPREVISTO 1,5 L'
  },
  'esordio-075': {
    priceId: 'price_1SiiPgLICPkyl0gPPDQ3D2Ky',
    unitAmount: 1200,
    promoEligible: true,
    equivalent075: 1,
    name: 'ESORDIO 0,75 L'
  },
  'esordio-150': {
    priceId: 'price_1SiWWLICPkyl0gPtZ48zBAZ',
    unitAmount: 2500,
    promoEligible: false,
    equivalent075: 3,
    name: 'ESORDIO 1,5 L'
  },
  'arturus-075': {
    priceId: 'price_1SiRxLICPkyl0gPXgirnVHn',
    unitAmount: 1200,
    promoEligible: true,
    equivalent075: 1,
    name: 'ARTURUS 0,75 L'
  },
  'abbandonato-0375': {
    priceId: 'price_1TGgvRLICPkyl0gPoNZD4ELt',
    unitAmount: 1000,
    promoEligible: false,
    equivalent075: 1,
    name: "L'ABBANDONATO 0,375 L"
  },
  'inceppo-075': {
    priceId: 'price_1TGgoRLICPkyl0gPCVF3ZyE3',
    unitAmount: 800,
    promoEligible: true,
    equivalent075: 1,
    name: 'INCEPPO 0,75 L'
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
  'legame-075': {
    priceId: 'price_1TGgzYLICPkyl0gP7vAAKT9Q',
    unitAmount: 700,
    promoEligible: true,
    equivalent075: 1,
    name: 'LEGAME 0,75 L'
  },
  'armonia-075': {
    priceId: 'price_1TGgyRLICPky10gPifDU09wp',
    unitAmount: 500,
    promoEligible: true,
    equivalent075: 1,
    name: 'ARMONIA 0,75 L'
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

  const rate = SHIPPING_RATES.find((r) => eqBottles <= r.maxEq);
  if (rate) return rate.amount;

  const extra = eqBottles - 60;
  const blocks = Math.ceil(extra / 6);
  return 8000 + (blocks * 800);
}

function buildNormalizedItems(items) {
  return items.map((item) => {
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
}

function calculateDiscountAmount(normalizedItems) {
  const eligibleLines = normalizedItems
    .filter((item) => item.promoEligible)
    .flatMap((item) => Array(item.quantity).fill(item.unitAmount))
    .sort((a, b) => a - b);

  const freeBottles = Math.floor(eligibleLines.length / 6);
  return eligibleLines
    .slice(0, freeBottles)
    .reduce((sum, amount) => sum + amount, 0);
}

app.get('/', (req, res) => {
  res.status(200).send('Ca’ Divina backend attivo');
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Carrello vuoto o non valido' });
    }

    const normalizedItems = buildNormalizedItems(items);

    const line_items = normalizedItems.map((item) => ({
      price: item.priceId,
      quantity: item.quantity
    }));

    const discountAmount = calculateDiscountAmount(normalizedItems);
    const eqBottles = normalizedItems.reduce(
      (sum, item) => sum + item.quantity * item.equivalent075,
      0
    );
    const shippingAmount = calculateShipping(eqBottles);

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
      locale: 'it',
      metadata: {
        eq_bottles: String(eqBottles),
        discount_amount: String(discountAmount),
        shipping_amount: String(shippingAmount)
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Errore Stripe:', error);
    res.status(500).json({
      error: error.message || 'Errore nella creazione del checkout'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
