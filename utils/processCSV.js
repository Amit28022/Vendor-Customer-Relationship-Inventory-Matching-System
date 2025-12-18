import db from "../db.js";

export default async function processCSV(filePath) {
  try {
    await db.query(
      `LOAD DATA LOCAL INFILE ?
       INTO TABLE product_data
       CHARACTER SET UTF8
       FIELDS TERMINATED BY ','
       OPTIONALLY ENCLOSED BY '"'
       LINES TERMINATED BY '\n'
       IGNORE 1 LINES
       (
         @buyer1,
         @item_desc,
         @qty,
         @uqc,
         @price,
         @buyer2,
         @contact,
         @email
       )
       SET
         Potential_Buyer_1 = NULLIF(TRIM(@buyer1), ''),
         Item_Description = NULLIF(TRIM(@item_desc), ''),
         Quantity = NULLIF(TRIM(@qty), ''),
         UQC = NULLIF(TRIM(@uqc), ''),
         Unit_Price = NULLIF(TRIM(@price), ''),
         Potential_Buyer_2 = NULLIF(TRIM(@buyer2), ''),
         Potential_Buyer_1_Contact_Details = NULLIF(TRIM(@contact), ''),
         Potential_Buyer_1_Email = NULLIF(TRIM(@email), '')`,
      [filePath]
    );

    console.log("LOAD DATA IMPORT DONE");
  } catch (err) {
    console.error("IMPORT ERROR:", err);
  }
}
