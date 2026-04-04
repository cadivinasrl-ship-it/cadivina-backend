const express = require('express');
const cors = require('cors');
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

const PRODUCTS = {
  'legame-075': { priceId: 'price_1TGgzYLICPkyl0gP7vAAKT9Q', promoEligible: true, equivalent075: 1 },
  'armonia-075': { priceId: 'price_1TGgyRLICPkyl0gPifDU09wp', promoEligible: true, equivalent075: 1 },
  'abbandonato-0375': { priceId: 'price_1TGgvRLICPkyl0gPoNZD4ELt', promoEligible: false, equivalent075: 0.5 },
  'dissenso-075': { priceId: 'price_1TGgtQLICPkyl0gPLdkcE12M', promoEligible: true, equivalent075: 1 },
  'memento-075': { priceId: 'price_1TGgrNLICPkyl0gP0xMwx65l', promoEligible: true, equivalent075: 1 },
  'inceppo-075': { priceId: 'price_1TGgoRLICPkyl0gPCVF3ZyE3', promoEligible: true, equivalent075: 1 },
  'esordio-150': { priceId: 'price_1SiWWLICPkyl0gPtZ48zBAZ', promoEligible: false, equivalent075: 3 },
  'imprevisto-150': { priceId: 'price_1SiVfLICPkyl0gPMsM851Wc', promoEligible: false, equivalent075: 3 },
  'arturus-075': { priceId: 'price_1SiRxLICPkyl0gPXgirnVHn', promoEligible: true, equivalent075: 1 },
  'imprevisto-075': { priceId: 'price_1SiiQmLICPkyl0gPDds6dS8J', promoEligible: true, equivalent075: 1 },
  'esordio-075': { priceId: 'price_1SiiPgLICPkyl0gPPDQ3D2Ky', promoEligible: true, equivalent075: 1 }
};

function calculateShipping(totalBottles) {
  if (totalBottles <= 2) return 1400;
  if (totalBottles <= 3) return 1450;
  if (totalBottles <= 6) return 1700;
  if (totalBottles <= 12) return 2400;
  return 3000;
}

function calculateDiscountAmount(items) {
  let eligibleBottles = 0;

  items.forEach(item => {
    const product = PRODUCTS[item.id];
    if (product && product.promoEligible) {
      eligibleBottles += item.quantity * product.equivalent075;
    }
  });

  const freeBottles = Math.floor(eligibleBottles / 6);
  return freeBottles * 700;
}

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;

    const line_items = items.map(item => {
      const product = PRODUCTS[item.id];
      if (!product) throw new Error(`Prodotto non valido: ${item.id}`);

      return {
        price: product.priceId,
        quantity: item.quantity
      };
    });

    const totalBottles = items.reduce((sum, item) => {
      const product = PRODUCTS[item.id];
      return sum + (product ? item.quantity * product.equivalent075 : 0);
    }, 0);

    const shippingCost = calculateShipping(totalBottles);
    const discountAmount = calculateDiscountAmount(items);

    let discounts = [];
    if (discountAmount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: discountAmount,
        currency: 'eur',
        duration: 'once'
      });

      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      discounts,
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: shippingCost,
              currency: 'eur'
            },
            display_name: 'Spedizione Italia'
          }
        }
      ],
      success_url: 'https://cadivina.it/success.html',
      cancel_url: 'https://cadivina.it/cancel.html'
    });

    res.json({ id: session.url });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
