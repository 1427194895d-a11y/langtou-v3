async function searchCodeByName(keyword) {
  if (!keyword) return null;

  if (/^\d{6}$/.test(keyword)) {
    try {
      const url =
        "https://searchapi.eastmoney.com/api/suggest/get?input=" +
        encodeURIComponent(keyword) +
        "&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";

      const text = await getText(url);
      const json = JSON.parse(text);

      const list =
        json &&
        json.QuotationCodeTable &&
        json.QuotationCodeTable.Data
          ? json.QuotationCodeTable.Data
          : [];

      const item =
        list.find(x => x.Code === keyword && x.Name) ||
        list.find(x => x.Code && x.Name && /^\d{6}$/.test(x.Code));

      if (item) {
        return {
          code: item.Code,
          name: item.Name
        };
      }
    } catch (e) {}

    return {
      code: keyword,
      name: keyword
    };
  }

  try {
    const url =
      "https://searchapi.eastmoney.com/api/suggest/get?input=" +
      encodeURIComponent(keyword) +
      "&type=14&token=04840f2bd59f45d2bf7eff7e30d1a2a7";

    const text = await getText(url);
    const json = JSON.parse(text);

    const list =
      json &&
      json.QuotationCodeTable &&
      json.QuotationCodeTable.Data
        ? json.QuotationCodeTable.Data
        : [];

    const item =
      list.find(x => x.Code && x.Name && /^\d{6}$/.test(x.Code)) || list[0];

    if (!item) return null;

    return {
      code: item.Code,
      name: item.Name
    };
  } catch (e) {
    return null;
  }
}
