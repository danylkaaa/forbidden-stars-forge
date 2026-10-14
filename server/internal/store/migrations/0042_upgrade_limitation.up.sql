-- An upgrade card may carry a limitation: a line of text centred at the bottom of the card, after its rules text.
ALTER TABLE cards ADD COLUMN limitation TEXT;
