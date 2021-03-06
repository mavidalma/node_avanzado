'use strict';

var express = require('express');
var router = express.Router();
const Ad = require('../../models/Ad');
const multer = require('multer');
const fs = require('fs');
var path = require('path');
const apiKeyProtected = require('../../lib/JWTAuth');
const service = require('../../services/coteRequester');

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/ad_pics/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({storage: storage});

//show ads
router.get('/', async(req, res, next) => {
  try {
    const query = {};

    console.log(req.originalUrl);
    console.log(req.originalUrl.startsWith('/api/'));

    req.query.title ? query.title = req.query.title : '';
    req.query.city ? query.city = req.query.city : '';
    req.query.type ? query.type = req.query.type : '';
    req.query.description ? query.$text = {$search: req.query.description} : '';

    if (req.query.tags) {
      const tagsArray = req.query.tags.split(' ');
      query.tags = {$in: tagsArray};
    }

    if(req.query.price) {
      const priceSplited = req.query.price.split('-');
      priceSplited[0] > 0 ? query.price = {$gt: priceSplited[0]} : query.price = {$gt: 0};
      priceSplited[1] > 0 ? query.price.$lt = priceSplited[1] : '';
    }

    const limit = parseInt(req.query.limit);
    const skip = parseInt(req.query.skip);
    const sort = req.query.sort;
    const select = req.query.select;
     
    console.log(query);
     

    const ads = await Ad.filter(query, limit, skip, sort, select);
    res.json({ads});

  } catch(err) {
    next(err);
  }
});

//get available tags
router.get('/tags', async (req, res, next) => {
  try{
    console.log(req);
    const tags = await Ad.distinct('tags');
    console.log(tags);
    res.json({success: true, tags});

  } catch(err) {
    next(err);
  }
});

//get unique ad

router.get('/:id', async(req, res, next) => {
  try {
    const _id = req.params.id;
    const ad = await Ad.findOne({_id});
    res.json({ad});
  } catch(err) {
    next(err);
  }
});

// Post Ad

router.post('/create', apiKeyProtected(), upload.fields([{name: 'cover', maxCount: 1}, {name: 'pictures', maxCount: 8}]), async function(req, res, next) {
  try {
    const adData =  req.body;

    if(!adData.title || !adData.price || !adData.type) {

      const err = new Error('You need to include a title and a price');
      err.status = 400;
      return next(err);

    } else {
      const cover = req.files.cover ? 'ad_pics/' + req.files.cover[0].filename : '';
      const thumbnail = req.files.cover ? 'thumbnails/' + req.files.cover[0].filename : '';
      const pictures = req.files.pictures ? req.files.pictures.map(item => 'ad_pics/' + item.filename) : [];
      const user = req.apiAuthUserId;
      const mail = req.apiAuthUserEmail;
      const ad = new Ad({...adData, pictures, cover, thumbnail, user});
      const savedAd = await ad.save();



      res.json({success: true, ad:savedAd});

      service.sendMail(process.env.ADMIN_EMAIL, mail, `Your ad "${adData.title}" has been created`, 'Your ad has been properly created. Thank you for using our platform and good luck!'); 
      req.files.cover ? service.createThumbnail(cover, thumbnail) : '';
    }

  } catch(err) {
    next(err);
  }
  
});

//update an Ad

router.put('/:id', apiKeyProtected(), async (req, res, next) => {
  try{
    const adData = req.body;
    const _id = req.params.id;
    const mail = req.apiAuthUserEmail;
      
    const ad = await Ad.findOne({_id});

    const updatedAd = await Ad.findOneAndUpdate(_id, adData, {new:true});

    res.json({success: `${_id}`, changes: updatedAd});

    service.sendMail(process.env.ADMIN_EMAIL, mail, `Your ad "${ad.title}" has been updated`, 'Your ad has been properly update. Thank you for using our platform and good luck!'); 

  } catch(err) {
    next(err);
  }
});

//update a cover of an ad
router.post('/cover/:id', apiKeyProtected(), upload.single('cover'), async(req, res, next) => {
  try {
    const _id = req.params.id;
    const cover = 'ad_pics/' + req.file.filename;
    const thumbnail = 'thumbnails/' + req.file.filename;
    const update = {'cover': cover, 'thumbnail': thumbnail};
    const ad = await Ad.findOne({_id});
    const mail = req.apiAuthUserEmail;

    await Ad.findOneAndUpdate(_id, update, {new:true});
    console.log('ad_pics/' + req.file.filename, 'thumbnails/' + req.file.filename);
    res.json({success: true, ad: _id, cover: cover, thumbnail: thumbnail});
    
    service.sendMail(process.env.ADMIN_EMAIL, mail, `Your ad "${ad.title}" has been updated`, 'Your ad has been properly update. Thank you for using our platform and good luck!'); 
    service.createThumbnail('ad_pics/' + req.file.filename, 'thumbnails/' + req.file.filename);
  
  } catch(err) {
    next(err);
  }

});

//update pictures of an ad
router.post('/pics/:id', apiKeyProtected(), upload.array('pictures', 8), async(req, res, next) => {
  try {
    //it overwrites ALL previous pictures with the ones posted. Might refactor
    const _id = req.params.id;
    const pictures = {'pictures': req.files.map(item => 'ad_pics/' + item.filename)};
    const mail = req.apiAuthUserEmail;

    const updatedAd = await Ad.findOneAndUpdate(_id, pictures, {new:true});
      
    res.json({success: true, Ad:_id, pictures: updatedAd.pictures});
    service.sendMail(process.env.ADMIN_EMAIL, mail, `Your ad "${updatedAd.title}" has been updated`, 'Your ad has been properly update. Thank you for using our platform and good luck!'); 

  } catch(err) {
    next(err);
  }
  
});

router.delete('/:id', apiKeyProtected(), async (req, res, next) => {
  try{
    const _id = req.params.id;
    const mail = req.apiAuthUserEmail;
    const ad = await Ad.findOne({_id});
    const cover = ad.cover;
    const pictures = ad.pictures;
    const thumbnail = ad.thumbnail;
    const allPics = [...pictures, cover, thumbnail];
        
    allPics.forEach(path => fs.unlinkSync('./public/' + path));
    await Ad.deleteOne({_id});
      
    res.json({success: true, 'deleted': _id});

    service.sendMail(process.env.ADMIN_EMAIL, mail, `Your ad "${ad.title}" has been deleted`, 'Your ad has been properly deleted. Thank you for have been using our platform'); 
      
  } catch(err) {
    next(err);
  }
});

module.exports = router;