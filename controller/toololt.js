const asyncHandler = require("express-async-handler");
const Geree = require("../models/geree");
const OrshinSuugch = require("../models/orshinSuugch");
const moment = require("moment");
const BankniiGuilgee = require("../models/bankniiGuilgee");

exports.gereeniiToololtAvya = asyncHandler(async (req, res, next) => {
  var gereeObject = Geree(req.body.tukhainBaaziinKholbolt);
  let query = [
    {
      $match: {
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.barilgiinId,
      },
    },
    {
      $facet: {
        tsutsalsan: [
          {
            $project: {
              tsutsalsan: {
                $cond: [
                  {
                    $eq: ["$tuluv", -1],
                  },
                  1,
                  0,
                ],
              },
            },
          },
          {
            $group: {
              _id: "Too",
              tsutsalsan: {
                $sum: "$tsutsalsan",
              },
            },
          },
        ],
        busad: [
          {
            $match: {
              tuluv: {
                $nin: [-1],
              },
            },
          },
          {
            $project: {
              khugatsaaKhetersen: {
                $cond: [
                  {
                    $lt: ["$duusakhOgnoo", new Date()],
                  },
                  1,
                  0,
                ],
              },
              kheviin: {
                $cond: [
                  {
                    $gte: ["$duusakhOgnoo", new Date()],
                  },
                  1,
                  0,
                ],
              },
              sungakh: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$turGereeEsekh", true] },
                      {
                        $lte: [
                          "$duusakhOgnoo",
                          new Date(moment(new Date()).add(1, "month")),
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
          {
            $group: {
              _id: "Too",
              khugatsaaKhetersen: {
                $sum: "$khugatsaaKhetersen",
              },
              kheviin: {
                $sum: "$kheviin",
              },
              sungakh: {
                $sum: "$sungakh",
              },
            },
          },
        ],
      },
    },
  ];
  var turQuery = [
    {
      $match: {
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.barilgiinId,
        tuluv: {
          $nin: [-1],
        },
      },
    },
    {
      $group: {
        _id: "$turGereeEsekh",
        too: {
          $sum: 1,
        },
      },
    },
  ];
  var turGeree = await gereeObject.aggregate(turQuery);
  gereeObject
    .aggregate(query)
    .then((result) => {
      if (result && result.length > 0) {
        if (
          result[0].tsutsalsan &&
          result[0].tsutsalsan.length > 0 &&
          result[0].busad &&
          result[0].busad.length > 0
        )
          result[0].busad[0].tsutsalsan = result[0].tsutsalsan[0].tsutsalsan;
        result = result[0].busad;
        if (turGeree && turGeree.length > 0 && result && result.length > 0) {
          result[0].turGeree = turGeree.find((a) => a._id)?.too;
          result[0].undsenGeree = turGeree.find((a) => !a._id)?.too;
        }
      }
      res.send(result);
    })
    .catch((err) => {
      next(err);
    });
});

exports.guilgeeniiToololtAvya = asyncHandler(async (req, res, next) => {
  try {
    var gereeObject = Geree(req.body.tukhainBaaziinKholbolt);
    var ekhlekhOgnoo = new Date(req.body.ekhlekhOgnoo);
    var duusakhOgnoo = new Date(req.body.duusakhOgnoo);
    var barilgiinId = req.body.barilgiinId;
    var match = {
      "avlaga.guilgeenuud.ognoo": {
        $lte: new Date(
          moment(req.body.duusakhOgnoo)
            .endOf("month")
            .format("YYYY-MM-DD 23:59:59")
        ),
      },
      $or: [
        {
          "avlaga.guilgeenuud.turul": {
            $nin: ["aldangi", "baritsaa"],
          },
        },
        {
          $and: [
            {
              "avlaga.guilgeenuud.turul": {
                $in: ["baritsaa"],
              },
            },
            {
              "avlaga.guilgeenuud.tulsunDun": {
                $gt: 0,
              },
            },
          ],
        },
      ],
      baiguullagiinId: req.body.baiguullagiinId,
      tuluv: {
        $ne: -1,
      },
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    let query = [
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: match,
      },
      {
        $group: {
          _id: "$gereeniiDugaar",
          tulukh: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulukhDun", 0],
            },
          },
          khyamdral: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.khyamdral", 0],
            },
          },
          tulsun: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulsunDun", 0],
            },
          },
        },
      },
      {
        $project: {
          dun: {
            $subtract: [
              "$tulukh",
              {
                $add: [
                  { $ifNull: ["$tulsun", 0] },
                  { $ifNull: ["$khyamdral", 0] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "avlaga",
          dun: {
            $sum: "$dun",
          },
          too: {
            $sum: 1,
          },
        },
      },
    ];
    var avlaga = await gereeObject.aggregate(query);
    match = {
      baiguullagiinId: req.body.baiguullagiinId,
      tuluv: {
        $ne: -1,
      },
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    query = [
      {
        $match: match,
      },
      {
        $group: {
          _id: "avlaga",
          dun: {
            $sum: { $ifNull: ["$aldangiinUldegdel", 0] },
          },
          too: {
            $sum: 1,
          },
        },
      },
    ];
    var avlagaAldangi = await gereeObject.aggregate(query);
    if (avlagaAldangi?.length > 0) {
      if (avlaga?.length > 0) {
        for await (const val of avlaga) val.dun += avlagaAldangi?.[0]?.dun;
      } else avlaga = avlagaAldangi;
    }

    match = {
      "avlaga.guilgeenuud.ognoo": {
        $lte: duusakhOgnoo,
        $gte: ekhlekhOgnoo,
      },
      "avlaga.guilgeenuud.turul": "voucher",
      baiguullagiinId: req.body.baiguullagiinId,
      tuluv: {
        $ne: -1,
      },
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    query = [
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: match,
      },
      {
        $group: {
          _id: "uglugu",
          dun: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulsunDun", 0],
            },
          },
          too: {
            $sum: 1,
          },
        },
      },
    ];
    var voucher = await gereeObject.aggregate(query);
    match = {
      daraagiinTulukhOgnoo: {
        $lte: duusakhOgnoo,
      },
      $or: [
        {
          "avlaga.guilgeenuud.turul": {
            $nin: ["aldangi", "baritsaa"],
          },
        },
        {
          $and: [
            {
              "avlaga.guilgeenuud.turul": {
                $in: ["baritsaa"],
              },
            },
            {
              "avlaga.guilgeenuud.tulsunDun": {
                $gt: 0,
              },
            },
          ],
        },
      ],
      baiguullagiinId: req.body.baiguullagiinId,
      tuluv: {
        $ne: -1,
      },
      uldegdel: {
        $gte: 0,
      },
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    query = [
      {
        $match: match,
      },
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: {
          "avlaga.guilgeenuud.ognoo": {
            $lte: duusakhOgnoo,
          },
        },
      },
      {
        $group: {
          _id: "khugatsaaKhetersen",
          tulukh: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulukhDun", 0],
            },
          },
          khyamdral: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.khyamdral", 0],
            },
          },
          tulsun: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulsunDun", 0],
            },
          },
        },
      },
      {
        $project: {
          dun: {
            $subtract: [
              "$tulukh",
              {
                $sum: ["$tulsun", "$khyamdral"],
              },
            ],
          },
        },
      },
    ];

    var khugatsaaKhetersen = await gereeObject.aggregate(query);
    match = {
      "avlaga.guilgeenuud.ognoo": {
        $lte: new Date(req.body.duusakhOgnoo),
        $gte: new Date(req.body.ekhlekhOgnoo),
      },
      baiguullagiinId: req.body.baiguullagiinId,
      $or: [
        {
          "avlaga.guilgeenuud.turul": {
            $nin: ["aldangi", "baritsaa"],
          },
        },
        {
          $and: [
            {
              "avlaga.guilgeenuud.turul": {
                $in: ["baritsaa"],
              },
            },
            {
              "avlaga.guilgeenuud.tulsunDun": {
                $gt: 0,
              },
            },
          ],
        },
      ],
      tuluv: {
        $ne: -1,
      },
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    query = [
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: match,
      },
      {
        $group: {
          _id: "$gereeniiDugaar",
          tulukh: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulukhDun", 0],
            },
          },
          khyamdral: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.khyamdral", 0],
            },
          },
        },
      },
      {
        $project: {
          dun: {
            $subtract: ["$tulukh", "$khyamdral"],
          },
        },
      },
    ];
    var eneSardTulukhJagsaalt = await gereeObject.aggregate(query);
    var eneSardTulukh = [];
    if (eneSardTulukhJagsaalt?.length > 0)
      eneSardTulukh.push({
        dun: eneSardTulukhJagsaalt?.reduce(
          (a, b) => a + (b.dun < 0 ? 0 : b.dun),
          0
        ),
      });
    else eneSardTulukh.push({ dun: 0 });

    match = {
      "avlaga.guilgeenuud.ognoo": {
        $gte: ekhlekhOgnoo,
        $lte: duusakhOgnoo,
      },
      "avlaga.guilgeenuud.guilgeeKhiisenAjiltniiNer": {
        $ne: "System",
      },
      baiguullagiinId: req.body.baiguullagiinId,
      $or: [
        {
          "avlaga.guilgeenuud.turul": {
            $nin: ["aldangi", "baritsaa", "zalruulga"],
          },
        },
        {
          $and: [
            {
              "avlaga.guilgeenuud.turul": {
                $in: ["baritsaa"],
              },
            },
            {
              "avlaga.guilgeenuud.tulsunDun": {
                $gt: 0,
              },
            },
          ],
        },
      ],
      tuluv: {
        $ne: -1,
      },
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    query = [
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: match,
      },
      {
        $group: {
          _id: "tulsun",
          dun: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulsunDun", 0],
            },
          },
        },
      },
    ];
    var eneSardTulsun = await gereeObject.aggregate(query);
    match = {
      "avlaga.guilgeenuud.ognoo": {
        $gte: ekhlekhOgnoo,
        $lte: duusakhOgnoo,
      },
      $or: [
        {
          "avlaga.guilgeenuud.turul": {
            $nin: ["aldangi", "baritsaa"],
          },
        },
        {
          $and: [
            {
              "avlaga.guilgeenuud.turul": {
                $in: ["baritsaa"],
              },
            },
            {
              "avlaga.guilgeenuud.tulsunDun": {
                $gt: 0,
              },
            },
          ],
        },
      ],
      baiguullagiinId: req.body.baiguullagiinId,
      tuluv: {
        $ne: -1,
      },
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    query = [
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: match,
      },
      {
        $project: {
          khyamdral: {
            $ifNull: ["$avlaga.guilgeenuud.khyamdral", 0],
          },
        },
      },
      {
        $group: {
          _id: "khyamdral",
          dun: {
            $sum: "$khyamdral",
          },
        },
      },
    ];
    var khungulult = await gereeObject.aggregate(query);
    match = {
      baiguullagiinId: req.body.baiguullagiinId,
      tuluv: -1,
    };
    if (!!barilgiinId) match["barilgiinId"] = barilgiinId;
    query = [
      {
        $match: match,
      },
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: {
          $or: [
            {
              "avlaga.guilgeenuud.turul": {
                $nin: ["aldangi", "baritsaa"],
              },
            },
            {
              $and: [
                {
                  "avlaga.guilgeenuud.turul": {
                    $in: ["baritsaa"],
                  },
                },
                {
                  "avlaga.guilgeenuud.tulsunDun": {
                    $gt: 0,
                  },
                },
              ],
            },
          ],
          "avlaga.guilgeenuud.ognoo": {
            $lte: duusakhOgnoo,
          },
        },
      },
      {
        $group: {
          _id: "$gereeniiDugaar",
          tulukh: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulukhDun", 0],
            },
          },
          khyamdral: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.khyamdral", 0],
            },
          },
          tulsun: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulsunDun", 0],
            },
          },
        },
      },
      {
        $project: {
          dun: {
            $subtract: [
              "$tulukh",
              {
                $sum: ["$tulsun", "$khyamdral"],
              },
            ],
          },
        },
      },
      // {
      //   $match: {
      //     dun: {
      //       $gt: 0,
      //     },
      //   },
      // },
      {
        $group: {
          _id: "tsutslagdsanAvlaga",
          dun: {
            $sum: "$dun",
          },
        },
      },
    ];
    var tsutslagdsanAvlaga = await gereeObject.aggregate(query);
    res.json({
      avlaga,
      voucher,
      khugatsaaKhetersen,
      eneSardTulukh,
      eneSardTulsun,
      khungulult,
      tsutslagdsanAvlaga,
    });
  } catch (err) {
    next(err);
  }
});

exports.bankniiGuilgeeToololtAvya = asyncHandler(async (req, res, next) => {
  let query;
  if (req.body.bank == "tdb")
    query = [
      {
        $match: {
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: req.body.barilgiinId,
          dansniiDugaar: req.body.dansniiDugaar,
          TxDt: {
            $gte: new Date(req.body.ekhlekhOgnoo),
            $lte: new Date(req.body.duusakhOgnoo),
          },
          Amt: {
            $gte: 0,
          },
        },
      },
      {
        $facet: {
          kholboson: [
            {
              $match: {
                "kholbosonGereeniiId.0": {
                  $exists: true,
                },
              },
            },
            {
              $group: {
                _id: "''",
                niit: {
                  $sum: 1,
                },
              },
            },
          ],
          magadlaltai: [
            {
              $match: {
                magadlaltaiGereenuud: {
                  $exists: true,
                },
                $or: [
                  {
                    kholbosonGereeniiId: {
                      $exists: false,
                    },
                  },
                  {
                    kholbosonGereeniiId: {
                      $size: 0,
                    },
                  },
                ],
              },
            },
            {
              $group: {
                _id: "",
                niit: {
                  $sum: 1,
                },
              },
            },
          ],
          todorkhoigui: [
            {
              $match: {
                "magadlaltaiGereenuud.0": {
                  $exists: false,
                },
                "kholbosonGereeniiId.0": {
                  $exists: false,
                },
              },
            },
            {
              $group: {
                _id: "",
                niit: {
                  $sum: 1,
                },
              },
            },
          ],
        },
      },
    ];
  else
    query = [
      {
        $match: {
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: req.body.barilgiinId,
          dansniiDugaar: req.body.dansniiDugaar,
          tranDate: {
            $gte: new Date(req.body.ekhlekhOgnoo),
            $lte: new Date(req.body.duusakhOgnoo),
          },
          amount: {
            $gte: 0,
          },
        },
      },
      {
        $facet: {
          kholboson: [
            {
              $match: {
                "kholbosonGereeniiId.0": {
                  $exists: true,
                },
              },
            },
            {
              $group: {
                _id: "''",
                niit: {
                  $sum: 1,
                },
              },
            },
          ],
          magadlaltai: [
            {
              $match: {
                magadlaltaiGereenuud: {
                  $exists: true,
                },
                $or: [
                  {
                    kholbosonGereeniiId: {
                      $exists: false,
                    },
                  },
                  {
                    kholbosonGereeniiId: {
                      $size: 0,
                    },
                  },
                ],
              },
            },
            {
              $group: {
                _id: "",
                niit: {
                  $sum: 1,
                },
              },
            },
          ],
          todorkhoigui: [
            {
              $match: {
                "magadlaltaiGereenuud.0": {
                  $exists: false,
                },
                "kholbosonGereeniiId.0": {
                  $exists: false,
                },
              },
            },
            {
              $group: {
                _id: "",
                niit: {
                  $sum: 1,
                },
              },
            },
          ],
        },
      },
    ];
  BankniiGuilgee(req.body.tukhainBaaziinKholbolt, true)
    .aggregate(query)
    .then((result) => {
      if (result && result.length > 0) {
        var butsaakh = {
          kholboson: 0,
          magadlaltai: 0,
          todorkhoigui: 0,
        };
        if (result[0].kholboson[0])
          butsaakh.kholboson = result[0].kholboson[0].niit;
        if (result[0].magadlaltai[0])
          butsaakh.magadlaltai = result[0].magadlaltai[0].niit;
        if (result[0].todorkhoigui[0])
          butsaakh.todorkhoigui = result[0].todorkhoigui[0].niit;
        butsaakh.niit =
          butsaakh.kholboson + butsaakh.magadlaltai + butsaakh.todorkhoigui;
        res.send(butsaakh);
      } else res.send(result);
    })
    .catch((err) => {
      next(err);
    });
});

exports.orshinSuugchiinTooAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var orshinSuugchObject = OrshinSuugch(db.erunkhiiKholbolt);
    let query = [
      {
        $match: {
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: req.params.barilgiinId,
        },
      },
      {
        $group: {
          _id: "$turul",
          too: {
            $sum: 1,
          },
        },
      },
    ];
    var khariuTurul = await orshinSuugchObject.aggregate(query);
    query = [
      {
        $match: {
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: req.params.barilgiinId,
        },
      },
      {
        $project: {
          idevkhiteiEsekh: { $ifNull: ["$idevkhiteiEsekh", false] },
        },
      },
      {
        $group: {
          _id: "$idevkhiteiEsekh",
          too: {
            $sum: 1,
          },
        },
      },
    ];
    var khariu = await orshinSuugchObject.aggregate(query);
    if (
      khariuTurul &&
      khariuTurul.length > 0 &&
      khariuTurul &&
      khariuTurul.length > 0
    )
      khariuTurul.push(...khariu);
    else if (!khariuTurul && khariuTurul && khariuTurul.length > 0)
      khariuTurul = khariu;
    res.send(khariuTurul);
  } catch (err) {
    next(err);
  }
});

exports.khyanakhSambariinUgugdul = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var gereeObject = Geree(req.body.tukhainBaaziinKholbolt);
    var ekhlekhOgnoo = new Date(req.body.ekhlekhOgnoo);
    var duusakhOgnoo = new Date(req.body.duusakhOgnoo);
    var query = [
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: {
          "avlaga.guilgeenuud.ognoo": {
            $gte: ekhlekhOgnoo,
            $lte: duusakhOgnoo,
          },
          baiguullagiinId: req.body.baiguullagiinId,
          "avlaga.guilgeenuud.turul": {
            $nin: ["baritsaa", "aldangi"],
          },
          tuluv: {
            $ne: -1,
          },
        },
      },
      {
        $group: {
          _id: "tulukh",
          tulukh: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulukhDun", 0],
            },
          },
          khyamdral: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.khyamdral", 0],
            },
          },
        },
      },
      {
        $project: {
          dun: {
            $subtract: ["$tulukh", "$khyamdral"],
          },
        },
      },
    ];
    var eneSardTulukh = await gereeObject.aggregate(query);
    query = [
      {
        $unwind: {
          path: "$avlaga.guilgeenuud",
        },
      },
      {
        $match: {
          "avlaga.guilgeenuud.ognoo": {
            $gte: ekhlekhOgnoo,
            $lte: duusakhOgnoo,
          },
          baiguullagiinId: req.body.baiguullagiinId,
          "avlaga.guilgeenuud.turul": {
            $nin: ["baritsaa", "aldangi"],
          },
        },
      },
      {
        $group: {
          _id: "tulsun",
          dun: {
            $sum: {
              $ifNull: ["$avlaga.guilgeenuud.tulsunDun", 0],
            },
          },
        },
      },
    ];
    var eneSardTulsun = await gereeObject.aggregate(query);
    var tulukhDun =
      eneSardTulukh && eneSardTulukh.length > 0 && eneSardTulukh[0].dun
        ? eneSardTulukh[0].dun
        : 0;
    var tulsunDun =
      eneSardTulsun && eneSardTulsun.length > 0 && eneSardTulsun[0].dun
        ? eneSardTulsun[0].dun
        : 0;
    var dutuu = tulukhDun - tulsunDun;
    query = [
      {
        $match: {
          baiguullagiinId: req.body.baiguullagiinId,
        },
      },
      {
        $project: {
          idevkhiteiEsekh: { $ifNull: ["$idevkhiteiEsekh", false] },
        },
      },
      {
        $group: {
          _id: "$idevkhiteiEsekh",
          too: {
            $sum: 1,
          },
        },
      },
    ];
    var khariu = await OrshinSuugch(db.erunkhiiKholbolt).aggregate(query);
    res.send({ dutuu, tulsunDun, khariu });
  } catch (err) {
    next(err);
  }
});
