-- Kontak & pembayaran sementara (dari owner, 2026-09-17). Nama pemilik akun
-- belum dikonfirmasi — ganti "holder" kalau beda.
update settings set value = '"+6287766647125"' where key = 'wa_admin_number';
update settings set value = '[
  {"bank":"ShopeePay","account_number":"087766647125","holder":"Pejastip Handal"},
  {"bank":"GoPay","account_number":"087766647125","holder":"Pejastip Handal"}
]' where key = 'bank_accounts';
