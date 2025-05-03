const { Order } = require("../model/Order");
const { Product } = require("../model/Product");
const { User } = require("../model/User");
const { sendMail, invoiceTemplate } = require("../services/common");

exports.fetchOrdersByUser = async (req, res) => {
    const { id } = req.user;
    try {
      const orders = await Order.find({ user: id });
  
      res.status(200).json(orders);
    } catch (err) {
      res.status(400).json(err);
    }
  };
  
  exports.createOrder = async (req, res) => {
    try {
      // First validate the order data
      if (!req.body.items || !req.body.user || !req.body.selectedAddress) {
        return res.status(400).json({ message: 'Missing required order information' });
      }

      // Create the order
      const order = new Order(req.body);
      
      // Update stock for each item
      for(let item of order.items) {
        if (!item.product || !item.product.id) {
          return res.status(400).json({ message: 'Invalid product information' });
        }
        
        const product = await Product.findOne({_id: item.product.id});
        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }
        
        if (product.stock < item.quantity) {
          return res.status(400).json({ message: 'Insufficient stock' });
        }
        
        product.$inc('stock', -1 * item.quantity);
        await product.save();
      }

      // Save the order
      const doc = await order.save();
      
      // Get user information
      const user = await User.findById(order.user);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Send confirmation email
      try {
        await sendMail({
          to: user.email,
          html: invoiceTemplate(order),
          subject: 'Order Received'
        });
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
        // Don't fail the order if email fails
      }

      res.status(201).json(doc);
    } catch (err) {
      console.error('Order creation error:', err);
      res.status(400).json({ 
        message: 'Failed to create order',
        error: err.message 
      });
    }
  };
  
  exports.deleteOrder = async (req, res) => {
      const { id } = req.params;
      try {
      const order = await Order.findByIdAndDelete(id);
      res.status(200).json(order);
    } catch (err) {
      res.status(400).json(err);
    }
  };
  
  exports.updateOrder = async (req, res) => {
    const { id } = req.params;
    try {
      const order = await Order.findByIdAndUpdate(id, req.body, {
        new: true,
      });
      res.status(200).json(order);
    } catch (err) {
      res.status(400).json(err);
    }
  };

  exports.fetchAllOrders = async (req, res) => {
    // sort = {_sort:"price",_order="desc"}
    // pagination = {_page:1,_limit=10}
    let query = Order.find({deleted:{$ne:true}});
    let totalOrdersQuery = Order.find({deleted:{$ne:true}});
  
    
    if (req.query._sort && req.query._order) {
      query = query.sort({ [req.query._sort]: req.query._order });
    }
  
    const totalDocs = await totalOrdersQuery.count().exec();
  
    if (req.query._page && req.query._limit) {
      const pageSize = req.query._limit;
      const page = req.query._page;
      query = query.skip(pageSize * (page - 1)).limit(pageSize);
    }
  
    try {
      const docs = await query.exec();
      res.set('X-Total-Count', totalDocs);
      res.status(200).json(docs);
    } catch (err) {
      res.status(400).json(err);
    }
  };
  