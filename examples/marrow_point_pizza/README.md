# Little Oven Pizza, Marrow Point

A small pizza restaurant website with a menu, cart and checkout, at 9 Ropewalk in
Marrow Point, the same town as `examples/guesthouse` and `examples/harbor_tours`.
It is `examples/pizza_restaurant` with an address, opening hours and a note on its
neighbors, Tidewhistle Guesthouse and Marrow Point Harbor Tours.
It uses plain HTML, CSS and JavaScript with no dependencies or build step.

From the repository root, run:

```shell
python -m http.server 8080 --directory ./examples/marrow_point_pizza
```

Open http://127.0.0.1:8080/. You can also open `index.html` directly in a browser.

## Try it

1. Browse the four pizzas, their ingredients, dietary labels and allergens.
2. Add pizzas, increase or decrease quantities, or remove items from the cart.
3. Enter a name, choose pickup or delivery, and optionally choose a time today.
   Delivery requires an address.
4. Select **Place demo order** to see an order number, items, total and fulfillment
   details. The cart empties so you can start another order.
5. Under **Find us**, see the address, phone number and opening hours, and the
   neighbors the restaurant recommends for rooms and boat trips.

Prices are in USD. Delivery is free and no taxes or other fees are added in this
demo. Orders and customer details stay in page memory; refreshing clears them.
No data is sent to a server, no payment is collected and no real order is placed.
The latest confirmation remains visible until another order replaces it or the
page is refreshed.

## Files

- `index.html`: semantic page structure, cart and checkout form.
- `styles.css`: small responsive layout, with no external fonts or assets.
- `script.js`: menu data, cart state, rendering and demo checkout.

The `menu` array in `script.js` contains stable item IDs,
prices in integer cents, ingredients, dietary labels and allergens.

`changeQuantity(id, change)` updates the cart, and `cartTotal()` calculates its
total. `placeOrder(event)` validates checkout, creates a simulated confirmation
and empties the cart.

Real payment, durable order storage and order tracking are not implemented.
Replace the demo checkout with a backend before accepting real orders.
