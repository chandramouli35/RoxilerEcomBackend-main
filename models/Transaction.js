// const { Transaction } = require('mongodb');
const mongoose = require('mongoose')

const transactionSchema = new mongoose.Schema({
    id: Number,
    title: String,
    price: Number,
    description: String,
    category: String,
    image: String,
    sold: Boolean,
    dateOfSale: String
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction