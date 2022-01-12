const express = require("express");
const app = express();
const port = 3300;

//DB.json파일에서 서버 설정을 불러옵니다.
//이때 server설정이 불러와지기 전에는 뒤의 코드의 실행을 멈춰야 하므로,
//동기함수인 readFileSync함수를 이용합니다.
const fs = require("fs");
const DB = JSON.parse(fs.readFileSync("DB.json"));

//DB와 연결하기 위해 준비합니다.
const mysql = require("mysql");
const connection = mysql.createPool({
  host: DB.host,
  port: DB.port,
  user: DB.user,
  password: DB.password,
});

//CORS 오류 해결
//참조 : https://xiubindev.tistory.com/115
const cors = require("cors");
const corsOptions = {
  origin: ["https://moneyctrlcv.com", "https://www.moneyctrlcv.com"],
};
app.use(cors()); //live일때는 app.use(cors(corsOptions))를 쓰자.

//Default Logging
// app.use(function (req, res, next) {
//   console.log(`Request getting handled : ${new Date()}`);
//   next();
// });

/*
===========
crypto DB
===========
*/
app.get("/crypto/transactionfee", (req, res, next) => {
  let market = "bithumb";
  let searchKey = "%%";

  if (req.query.market != undefined) {
    market = req.query.market.toLowerCase();
  }
  if (req.query.searchkey != undefined) {
    searchKey = `%${req.query.searchkey.trim()}%`;
  }

  const sql =
    "SELECT * FROM crypto.transactionfee WHERE market=? AND (name LIKE ? OR code LIKE ?) ORDER BY fee ASC";
  const params = [market, searchKey, searchKey];
  connection.query(sql, params, (err, rows) => {
    if (err) next(err);
    res.send(rows);
  });
});

/*
===========
stock DB
===========
*/
// 전체 list
app.get("/stock/financial_state/list", (req, res, next) => {
  let stock_market = "KOSPI";
  let curpage = 0;
  let perpage = 100;
  let sortConfig = { key: "total_assets", direction: "DESC" };
  let searchKey = "%%";

  if (req.query.stock_market != undefined) {
    stock_market = req.query.stock_market;
  }
  if (!isNaN(req.query.curpage) && !isNaN(req.query.perpage)) {
    curpage = parseInt(req.query.curpage);
    perpage = parseInt(req.query.perpage);
  }
  if (req.query.sortkey != undefined) {
    sortConfig.key = req.query.sortkey;
  }
  if (req.query.sortdir === "asc" || req.query.sortdir === "desc") {
    sortConfig.direction = req.query.sortdir.toUpperCase();
  }
  if (req.query.searchkey != undefined) {
    searchKey = `%${req.query.searchkey.trim()}%`;
  }

  const sql =
    "SELECT CP.stock_code, CP.stock_name, CP.stock_market, FS.bsns_year, FS.total_assets \
    FROM stock.corpdata AS CP \
    JOIN ( \
      SELECT A.corp_code, A.bsns_year, A.total_assets \
        FROM stock.FinancialState AS A \
        JOIN( \
        SELECT corp_code, MAX(bsns_year) AS bsns_year \
            FROM stock.FinancialState \
            GROUP BY corp_code \
      ) AS B \
        ON A.corp_code=B.corp_code AND A.bsns_year=B.bsns_year \
    ) AS FS \
    ON CP.corp_code=FS.corp_code \
    WHERE CP.stock_market=? AND (CP.stock_name LIKE ? OR CP.corp_name LIKE ? OR CP.corp_name_eng LIKE ? OR CP.stock_code LIKE ?)" +
    `ORDER BY ?? ${sortConfig.direction} ` +
    "LIMIT ?,?";
  const params = [
    stock_market.toUpperCase(),
    searchKey,
    searchKey,
    searchKey,
    searchKey,
    sortConfig.key,
    perpage * curpage,
    perpage,
  ];
  connection.query(sql, params, (err, rows) => {
    if (err) next(err);
    res.send(rows);
  });
});
// 전체 list count
app.get("/stock/financial_state/list/cnt", (req, res, next) => {
  let stock_market = "KOSPI";
  let searchKey = "%%";

  if (req.query.stock_market != undefined) {
    stock_market = req.query.stock_market;
  }
  if (req.query.searchkey != undefined) {
    searchKey = `%${req.query.searchkey.trim()}%`;
  }

  const sql =
    "SELECT COUNT(*) AS CNT \
    FROM stock.corpdata AS CP \
    JOIN ( \
      SELECT A.corp_code, A.bsns_year, A.total_assets \
        FROM stock.FinancialState AS A \
        JOIN( \
        SELECT corp_code, MAX(bsns_year) AS bsns_year \
            FROM stock.FinancialState \
            GROUP BY corp_code \
      ) AS B \
        ON A.corp_code=B.corp_code AND A.bsns_year=B.bsns_year \
    ) AS FS \
    ON CP.corp_code=FS.corp_code \
    WHERE CP.stock_market=? AND (CP.stock_name LIKE ? OR CP.corp_name LIKE ? OR CP.corp_name_eng LIKE ? OR CP.stock_code LIKE ?)";
  const params = [
    stock_market.toUpperCase(),
    searchKey,
    searchKey,
    searchKey,
    searchKey,
  ];
  connection.query(sql, params, (err, rows) => {
    if (err) next(err);
    res.send({
      stock_market: stock_market,
      COUNT: rows[0].CNT,
    });
  });
});

//기본 정보
app.get("/stock/corpdata/:stock_code", (req, res, next) => {
  const { stock_code } = req.params;

  const sql =
    "SELECT * FROM stock.corpdata \
    JOIN stock.KISC USING(induty_code) \
    WHERE corpdata.stock_code=?";
  const params = [stock_code];
  connection.query(sql, params, (err, rows) => {
    if (err) next(err);
    res.send(rows[0]);
  });
});

//재무제표 정보
app.get("/stock/financial_state/:stock_code", (req, res, next) => {
  const { stock_code } = req.params;

  const sql =
    "SELECT FinancialState.* FROM stock.FinancialState \
    JOIN stock.corpdata USING(corp_code) \
    WHERE corpdata.stock_code=?";
  const params = [stock_code];
  connection.query(sql, params, (err, rows) => {
    if (err) next(err);
    res.send(rows);
  });
});
//재무제표 부가정보
app.get("/stock/financial_state_etc/:stock_code", (req, res, next) => {
  try {
    const { stock_code } = req.params;

    const sql =
      "SELECT FinancialStateEtc.* FROM stock.FinancialStateEtc \
    JOIN stock.corpdata USING(corp_code) \
    WHERE corpdata.stock_code=?";
    const params = [stock_code];
    connection.query(sql, params, (err, rows) => {
      if (err) next(err);
      res.send(rows);
    });
  } catch (err) {
    next(err);
  }
});
//업종별 정보(key:비교할려하는 정보. ex.sales)
app.get("/stock/induty_compare", (req, res, next) => {
  const { stock_code } = req.query;
  const { key } = req.query;

  //우선 해당 stock_code의 induty_code를 구합니다.
  let sql =
    "SELECT induty_code FROM stock.corpdata \
    JOIN stock.KISC USING(induty_code) \
    WHERE corpdata.stock_code=?";
  let params = [stock_code];
  connection.query(sql, params, (err, rows) => {
    if (err) next(err);
    try {
      const induty_code = rows[0].induty_code;

      //구해진 induty_code를 이용하여 해당 induty에 있는 기업들의 정보를 받습니다.
      sql =
        "SELECT D.stock_code AS stock_code, D.stock_name AS stock_name, D.induty_code AS induty_code, C.* \
      FROM stock.corpdata AS D \
      JOIN( \
        SELECT B.corp_code AS corp_code, B.bsns_year as bsns_year, B.?? AS ??, B.total_assets AS total_assets \
          FROM stock.FinancialState AS B \
          JOIN( \
            SELECT corp_code, MAX(bsns_year) AS bsns_year \
            FROM stock.FinancialState \
            GROUP BY corp_code \
          ) AS A \
        ON B.corp_code=A.corp_code AND B.bsns_year=A.bsns_year \
      ) AS C \
      ON D.corp_code=C.corp_code \
      WHERE induty_code=? \
      ORDER BY total_assets DESC";
      params = [key, key, induty_code];
      connection.query(sql, params, (err, rows) => {
        if (err) next(err);
        res.send(rows);
      });
    } catch (error) {
      next(error);
    }
  });
});

/* 404 Page Error */
app.use(function (req, res, next) {
  res.status(404).send("해당 페이지를 찾을 수 없습니다.");
});
/* 500 Page Error */
app.use(function (err, req, res, next) {
  // console.error(err.stack);
  res.status(500).send("load에 실패했습니다. parameter를 다시 확인해주세요.");
});

//console log
app.listen(port, () => {
  console.log(`Moneyctrlcv_Express listening at http://localhost:${port}`);
});
