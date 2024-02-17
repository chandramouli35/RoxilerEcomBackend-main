
const express = require('express')
const mongoose = require('mongoose')
const axios = require('axios')   
const cors = require('cors')   
require('dotenv').config();
const Transaction = require('./models/Transaction')

const app = express();
app.use(express.json());

app.use(cors());


MONGO_URL = 'mongodb+srv://chandramouli:123456789cmn@cluster0.83n1dpq.mongodb.net/?retryWrites=true&w=majority';

//  MONGODB CONNECTION
mongoose.connect(MONGO_URL)

.then(()=>{
    console.log('MongoDB Connected Successfully')
})
.catch((error) => {
    console.log('MongoDB Not Connected:', error)
});


//  SERVER PORT
const port = process.env.PORT || 4000;


//  INITIALIZING DATABASE WITH SEED DATA
app.get('/api/initializeDatabase', async(request, response) => {
    try {
        //  FETCH DATA FROM THIRD_PARTY API
        const fetchData = await axios('https://s3.amazonaws.com/roxiler.com/product_transaction.json')
        const jsonData = await fetchData.data
        
        //  EMPTY
        await Transaction.deleteMany();
        //  INSERT DATA TO DATABASE
        await Transaction.insertMany(jsonData);

        response.status(200).json({massage: 'database Initialized with seed data'})
        
    } catch (error) {
        console.log('Error initilizing database:', error)
        response.status(500).json({message: 'Failed initialize Database Error'})
    }
});



// GET DATA FROM MongoDB
app.get('/api/transactions', async (request, response)=>{
    try {
        const defaultMonth = '01'
        const {month=defaultMonth, search='',page=1,perPage=10} = request.query;
        let numericSearch = parseFloat(search);

        //  MongoDB Query
        const pipeline = [
            {
                $match:{
                    $and: [
                        {$expr: {$eq: [{$month: {$toDate: '$dateOfSale'}}, parseInt(month)]}},
                        {
                            $or: [
                                    {title: {$regex: search, $options: 'i'}},
                                    {description: {$regex: search, $options: 'i'}},
                                    {price: isNaN(numericSearch)? null: numericSearch}
                                ]
                        },
                    ]
                    
                }
            },
            {$limit: perPage},
            // {$skip: page * perPage},
        ]
        const transaction = await Transaction.aggregate(pipeline).option({ maxTimeMS: 60000 });
        
        response.status(200).json({transaction});

    } catch (error) {
        console.log('error in transaction:', error);
        response.status(500).json({error: 'Internal server error', details: error.message})
    }
})


//  GET Statistics
app.get('/api/statistics', async (request,response)=>{
    try {
        const {month} = request.query;

        //  TOTAL SALE AMOUNT
        const totalSaleAmount = await Transaction.aggregate([
            {
                $match: {
                    $expr: {
                        $eq: [{$month: {$toDate: '$dateOfSale'}}, parseInt(month)],
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    totalAmount: {$sum: '$price'},
                },
            },
        ]);

        //  TOTAL SOLD ITEMS
        const totalSoldItems = await Transaction.countDocuments({
            $expr:{
                $eq:[{$month: {$toDate: '$dateOfSale'}}, parseInt(month)],
            },
            sold: true,
        });

        //  TOTAL NOT SOLD ITEMS
        const totalNotSoldItems = await Transaction.countDocuments({
            $expr: {
                $eq: [{$month: {$toDate: '$dateOfSale'}}, parseInt(month)],
            },
            sold: false,
        });

        response.status(200).json({
            totalSaleAmount:
                totalSaleAmount.length > 0 ? (totalSaleAmount[0].totalAmount.toFixed(2)) : 0,
            totalSoldItems,
            totalNotSoldItems,
        })
    } catch (error) {
        console.log('Failed Fetched to Statistics', error)
        if(error.message === 'Invalid month value'){
            response.status(400).json({message:'Invalid Month Value'})
        }else{
            response.status(500).json({message:'Failed Fetched to Statistics'})
        }
    }

})


// Bar Chart Data
app.get('/api/bar-chart', async (request, response) =>{
    try {
        const {month} = request.query; 

        const pipeline = [
            {
                $match: {
                    $expr: { $eq: [{ $month: { $toDate: "$dateOfSale" } }, parseInt(month)] }
                }
            },
            {
                $project: {
                    price: 1,
                    priceRange: {
                        $switch: {
                            branches: [
                                { case: { $and: [{ $gte: ['$price', 0] }, { $lte: ['$price', 100] }] }, then: '0 - 100' },
                                { case: { $and: [{ $gte: ['$price', 101] }, { $lte: ['$price', 200] }] }, then: '101 - 200' },
                                { case: { $and: [{ $gte: ['$price', 201] }, { $lte: ['$price', 300] }] }, then: '201 - 300' },
                                { case: { $and: [{ $gte: ['$price', 301] }, { $lte: ['$price', 400] }] }, then: '301 - 400' },
                                { case: { $and: [{ $gte: ['$price', 401] }, { $lte: ['$price', 500] }] }, then: '401 - 500' },
                                { case: { $and: [{ $gte: ['$price', 501] }, { $lte: ['$price', 600] }] }, then: '501 - 600' },
                                { case: { $and: [{ $gte: ['$price', 601] }, { $lte: ['$price', 700] }] }, then: '601 - 700' },
                                { case: { $and: [{ $gte: ['$price', 701] }, { $lte: ['$price', 800] }] }, then: '701 - 800' },
                                { case: { $and: [{ $gte: ['$price', 801] }, { $lte: ['$price', 900] }] }, then: '801 - 900' }
                            ],
                            default: '901 - Above'
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$priceRange',
                    itemCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    range: '$_id',
                    itemCount: 1
                }
            },
            {
                $sort: { range: 1 }
            }
        ];
    
        const result = await Transaction.aggregate(pipeline).option({ maxTimeMS: 60000 });
        response.status(200).json({result});

    } catch (error) {
        response.status(400).json({ message: error.message });
    }
})



// GET  Pai Chart Data
app.get('/api/pie-chart', async (request, response) => {
    try {
        const {month} = request.query;

        const transactions = await Transaction.find({
            $expr: { $eq: [{ $month: { $toDate: "$dateOfSale" } }, parseInt(month)] }
        })

        const categoryCounts = {};

        transactions.forEach((transaction) => {
            const category =  transaction.category;
            if(categoryCounts.hasOwnProperty(category)){
                categoryCounts[category]++;
            }else{
                categoryCounts[category] = 1;
            }
        });

        response.status(200).json({categoryCounts})

    } catch (error) {
        console.log('Failed to generate Pai Chart', error);
        response.status(500).json({error: 'failed to generate Pai Chart'})
    }
})

app.listen(port, () =>{
    console.log(`connection is setup at http://localhost:${port}`)
})