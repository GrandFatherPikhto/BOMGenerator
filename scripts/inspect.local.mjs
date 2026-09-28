import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';
await mongoose.connect(uri);
const db = mongoose.connection.db;

const sellers = await db.collection('sellers').find().sort({ _id: 1 }).toArray();
console.log('sellers (insertion order):');
for (const s of sellers) console.log(' ', String(s._id), JSON.stringify(s.name));

const products = await db.collection('sellerproducts').find().sort({ _id: 1 }).toArray();
console.log('\nproducts (insertion order), first 10:');
for (const p of products.slice(0, 10)) {
  console.log(' ', String(p._id), 'seller=', String(p.sellerId), JSON.stringify(p.name));
}
console.log('total products:', products.length);

const lines = await db.collection('bomlines').find({ productId: { $ne: null } }).toArray();
const byProduct = {};
for (const l of lines) {
  const k = String(l.productId);
  byProduct[k] = (byProduct[k] || 0) + 1;
}
console.log('\nlines with productId assigned:', lines.length);
console.log('distribution by product id:', byProduct);

const nameById = new Map(products.map((p) => [String(p._id), p.name]));
console.log('\ndistribution by product name:');
for (const [id, count] of Object.entries(byProduct)) {
  console.log(' ', nameById.get(id) ?? '(unknown product ' + id + ')', '->', count, 'lines');
}

// any BomLine still carrying the legacy sellerId field?
const legacy = await db.collection('bomlines').countDocuments({ sellerId: { $exists: true } });
console.log('\nBomLines still with legacy sellerId field:', legacy);

await mongoose.disconnect();
