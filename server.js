

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const DOMAIN = process.env.DOMAIN;

const PRICE_MAP = {
  legame-075: "price_1TGgzYLICPkyl0gP7vAAKT9Q",
  armania-075: "price_1TGgyRLICPky10gPifDU09wp",
  labbandonato-0375: "price_1TGgvRLICPkyl0gPoNZD4ELt",
  dissenso-075: "price_1TGgtQLICPkyl0gPLdkcE12M",
  memento-075: "price_1TGgrNLICPkyl0gP0xMwx65l",
  inceppo-075: "price_1TGgoRLICPkyl0gPCVF3ZyE3",
  esordio-150: "price_1SiWWLICPkyl0gPtZ48zBAZ",
  imprevisto-150: "price_1SiVfLICPkyl0gPMsM851Wc",
  arturus-075: "price_1SiRxLICPkyl0gPXgirnVHn",
  imprevisto-075: "price_1SiiQmLICPkyl0gPDds6dS8J",
  esordio-075: "price_1SiiPgLICPkyl0gPPDQ3D2Ky"
};

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Carrello vuoto o non valido" });
    }

    const line_items = items.map((item) => {
      const productId = item.id;
      const quantity = Number(item.quantity);

      if (!PRICE_MAP[productId]) {
        throw new Error(`Prodotto non valido: ${productId}`);
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`Quantità non valida per: ${productId}`);
      }

      return {
        price: PRICE_MAP[productId],
        quantity: quantity
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel.html`,
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["IT"]
      },
      locale: "it"
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Errore Stripe:", error.message);
    res.status(500).json({
      error: error.message || "Errore nella creazione del checkout"
    });
  }
});

app.listen(3000, () => {
  console.log("Server attivo su http://localhost:3000");
});
